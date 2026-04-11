/**
 * Events страница - журнал событий
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import useApi from '../../hooks/useApi';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import { useLanguage } from '../../context/LanguageContext';
import { getJournalDump, getJournalStat, getConfigFull, clearJournal } from '../../services/api';
import EventsTable from '../../components/ui/EventsTable';
import EventsFilterBar from '../../components/ui/EventsFilterBar';
import Pagination from '../../components/ui/Pagination';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { formatTimestamp } from '../../utils/formatters';
import { formatJournalUserColumn } from '../../utils/journalUserDisplay';
import './Monitoring.css';

const Events = () => {
  const { t } = useLanguage();
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(20);
  const [filters, setFilters] = useState({
    eventType: 'all',
    doorId: '',
  });
  const [totalRecords, setTotalRecords] = useState(0); // Реальное количество записей из журнала
  const [refreshKey, setRefreshKey] = useState(0); // Ключ для принудительного обновления при изменении limit
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  /** Текст + вариант оформления (как alert-success / alert-error на странице конфигурации). */
  const [actionBanner, setActionBanner] = useState(null);

  /** Сообщения после сохранения/печати и т.п. — скрываем через несколько секунд и при «Обновить». */
  useEffect(() => {
    if (actionBanner == null) return undefined;
    const id = setTimeout(() => setActionBanner(null), 5000);
    return () => clearTimeout(id);
  }, [actionBanner]);

  // Функция для получения статистики журнала (для получения общего количества записей)
  const fetchJournalStat = useCallback((signal) => {
    return getJournalStat(signal);
  }, []);

  // Получаем статистику журнала для определения общего количества записей
  const { data: journalStat, loading: statLoading, refetch: refetchStat } = useApi(fetchJournalStat, []);

  // Загружаем активную конфигурацию, чтобы привязать события к drawingId двери.
  // Важно: drawingId находится в cfg.doors[], поэтому для таблицы журнала
  // формируем быстрый lookup по globalDoorId.
  const fetchConfigFull = useCallback((signal) => getConfigFull(signal), []);
  const { data: configFull, refetch: refetchConfig } = useApi(fetchConfigFull, []);

  const doorMetaByGlobalId = useMemo(() => {
    const map = {};
    const doors = configFull?.doors || [];
    for (const door of doors) {
      let gid = Number(door?.globalDoorId);
      if (!Number.isFinite(gid) || gid <= 0) {
        const n = Number(door?.nodeId);
        const l = Number(door?.localDoor);
        if (Number.isFinite(n) && Number.isFinite(l) && n >= 1 && l >= 1) {
          gid = (n - 1) * 8 + l;
        }
      }
      if (!Number.isFinite(gid) || gid <= 0) continue;
      const c = door?.comment;
      map[gid] = {
        drawingId: door?.drawingId ?? null,
        comment: typeof c === 'string' ? c : (c != null ? String(c) : ''),
      };
    }
    return map;
  }, [configFull]);

  // Обновляем totalRecords при получении статистики
  useEffect(() => {
    /* Для пагинации нужен фактический объём кольцевого журнала.
     * Предпочитаем totalRecords (новое поле API), а recordsWritten оставляем как fallback
     * для обратной совместимости со старыми прошивками. */
    if (journalStat && (journalStat.totalRecords !== undefined || journalStat.recordsWritten !== undefined)) {
      const total = journalStat.totalRecords ?? journalStat.recordsWritten ?? 0;
      setTotalRecords(total);
    }
  }, [journalStat]);

  // Функция для получения событий с учетом offset и limit
  // signal передается автоматически из useApi
  const fetchEvents = useCallback((signal) => {
    const actualLimit = Math.min(100, Math.max(1, limit));
    return getJournalDump(offset, actualLimit, signal);
  }, [offset, limit]);

  // Получаем события
  // ВАЖНО: dependencies включают totalRecords и refreshKey, чтобы при их изменении перезапросить данные
  // refreshKey используется для принудительного обновления при изменении limit
  const { data: events, loading, error, refetch } = useApi(fetchEvents, [offset, limit, totalRecords, refreshKey]);

  // Автообновление каждые 5 с (только если нет активных фильтров)
  const hasActiveFilters =
    (filters.eventType && filters.eventType !== 'all') ||
    filters.doorId;

  useAutoRefresh(async () => {
    if (!hasActiveFilters) {
      // Сначала обновляем статистику журнала (чтобы получить актуальное totalRecords)
      // Затем обновляем события (чтобы увидеть новые записи)
      // Используем тихое обновление, чтобы не показывать состояние загрузки
      try {
        await refetchStat(true);
        // Небольшая задержка, чтобы статистика успела обновиться
        await new Promise(resolve => setTimeout(resolve, 100));
        await refetch(true);
      } catch (error) {
        // Игнорируем ошибки при автообновлении
        console.warn('Ошибка автообновления:', error);
      }
    }
  }, 5000);

  // Обработчики пагинации
  const handlePrevious = () => {
    const newOffset = Math.max(0, offset - limit);
    setOffset(newOffset);
  };

  const handleNext = () => {
    /* Если totalRecords известно — используем его.
     * Иначе ориентируемся на факт: текущая страница полная, значит
     * вероятно есть более старые записи и можно идти дальше. */
    const pageCount = events?.records?.length || 0;
    if (totalRecords > 0) {
      if (offset + limit < totalRecords) setOffset(offset + limit);
    } else if (pageCount >= limit) {
      setOffset(offset + limit);
    }
  };

  const handlePageSizeChange = (newLimit) => {
    // При изменении размера страницы сбрасываем offset и обновляем limit
    setOffset(0);
    setLimit(newLimit);
    
    // Принудительно обновляем refreshKey, чтобы useApi перезапросил данные
    // Это гарантирует, что при изменении limit данные точно обновятся
    setRefreshKey(prev => prev + 1);
    
    // Принудительно обновляем статистику, чтобы получить актуальный totalRecords
    // Это важно, так как при изменении limit мы хотим показать все доступные записи
    refetchStat(true);
  };

  const handleFirstPage = () => {
    setOffset(0);
  };

  const handlePageClick = (pageNumber) => {
    const newOffset = (pageNumber - 1) * limit;
    if (newOffset >= 0 && newOffset < totalRecords) {
      setOffset(newOffset);
    }
  };

  const handleRefresh = async () => {
    setActionBanner(null);
    try {
      await refetchConfig(true);
      await refetchStat(true);
      await new Promise(resolve => setTimeout(resolve, 100));
      // refetch(false) — показываем загрузку и принудительно обновляем список событий
      await refetch(false);
      setActionBanner({ text: t('common.refreshDataSuccess'), variant: 'success' });
    } catch (err) {
      console.warn('Ошибка обновления журнала:', err);
      setActionBanner({ text: t('common.refreshDataFailed'), variant: 'error' });
    }
  };

  /* Получить все записи журнала для экспорта/печати.
   * Почему не берём только текущую страницу:
   * - пользователь ожидает действие над всем журналом, а не над видимым куском.
   * Как работает:
   * - читаем размер журнала из totalRecords;
   * - запрашиваем пакетами по 100 (максимум API);
   * - собираем единый массив в порядке "новые -> старые". */
  const fetchAllRecordsForExport = async () => {
    const total = totalRecords > 0 ? totalRecords : (events?.records?.length || 0);
    if (total <= 0) return [];

    const chunkSize = 100;
    const all = [];
    for (let off = 0; off < total; off += chunkSize) {
      const chunk = await getJournalDump(off, chunkSize);
      const recs = chunk?.records || [];
      if (recs.length === 0) break;
      all.push(...recs);
      if (recs.length < chunkSize) break;
    }
    return all;
  };

  /* Кнопка "Очистить журнал": подтверждение + очистка на контроллере + обновление UI. */
  const handleClearJournal = async () => {
    setActionLoading(true);
    setActionBanner(null);
    try {
      await clearJournal();
      setOffset(0);
      await refetchStat(false);
      await refetch(false);
      setActionBanner({ text: t('pages.events.clearSuccess'), variant: 'success' });
    } catch (err) {
      console.warn('Ошибка очистки журнала:', err);
      setActionBanner({ text: t('pages.events.clearFailed'), variant: 'error' });
    } finally {
      setActionLoading(false);
      setShowClearConfirm(false);
    }
  };

  /* Кнопка "Сохранить журнал": формируем CSV и отдаём в браузер,
   * чтобы пользователь выбрал место сохранения через стандартный диалог. */
  const handleSaveJournal = async () => {
    setActionLoading(true);
    setActionBanner(null);
    try {
      const records = await fetchAllRecordsForExport();
      if (!records.length) {
        setActionBanner({ text: t('pages.events.emptyForSave'), variant: 'neutral' });
        return;
      }

      const header = ['recSeq', 'timestamp', 'time', 'type', 'doorId', 'user', 'flags'];
      const lines = [header.join(';')];

      records.forEach((r) => {
        const row = [
          r.recSeq ?? '',
          r.timestamp ?? '',
          formatTimestamp(r.timestamp),
          r.type ?? '',
          r.doorId ?? '',
          String(formatJournalUserColumn(r, t)).replace(/;/g, ','),
          r.flags ?? '',
        ];
        lines.push(row.join(';'));
      });

      const csvText = `\uFEFF${lines.join('\n')}`;
      const filename = `journal_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;

      /* Основной путь: нативный системный диалог выбора места сохранения
       * (поддерживается в Chromium-браузерах через File System Access API). */
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'CSV',
            accept: { 'text/csv': ['.csv'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(csvText);
        await writable.close();
      } else {
        /* Fallback: стандартное скачивание файла браузером. */
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      setActionBanner({ text: t('pages.events.saveSuccess'), variant: 'success' });
    } catch (err) {
      console.warn('Ошибка сохранения журнала:', err);
      setActionBanner({ text: t('pages.events.saveFailed'), variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  /* Кнопка "Распечатать журнал": открываем отдельное окно с таблицей и запускаем print(). */
  const handlePrintJournal = async () => {
    setActionLoading(true);
    setActionBanner(null);
    /* Окно открываем синхронно по клику, иначе браузер может заблокировать popup. */
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setActionLoading(false);
      setActionBanner({ text: t('pages.events.popupBlocked'), variant: 'error' });
      return;
    }
    try {
      const records = await fetchAllRecordsForExport();
      if (!records.length) {
        printWindow.document.write(`<html><body><h3>${t('pages.events.printEmptyTitle')}</h3></body></html>`);
        printWindow.document.close();
        setActionBanner({ text: t('pages.events.emptyForPrint'), variant: 'neutral' });
        return;
      }

      const escHtml = (s) => String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const rowsHtml = records.map((r) => `
        <tr>
          <td>${r.recSeq ?? ''}</td>
          <td>${escHtml(formatTimestamp(r.timestamp))}</td>
          <td>${escHtml(r.type)}</td>
          <td>${r.doorId ?? ''}</td>
          <td>${escHtml(formatJournalUserColumn(r, t))}</td>
        </tr>
      `).join('');
      printWindow.document.write(`
        <html>
          <head>
            <title>${t('pages.events.printTitle')}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 16px; }
              h1 { margin: 0 0 12px; }
              table { border-collapse: collapse; width: 100%; font-size: 12px; }
              th, td { border: 1px solid #999; padding: 6px; text-align: left; }
              th { background: #f3f3f3; }
            </style>
          </head>
          <body>
            <h1>${t('pages.events.printTitle')}</h1>
            <table>
              <thead>
                <tr>
                  <th>${t('pages.events.printColNum')}</th>
                  <th>${t('pages.events.printColTime')}</th>
                  <th>${t('pages.events.printColType')}</th>
                  <th>${t('pages.events.printColDoor')}</th>
                  <th>${t('pages.events.printColUser')}</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      setActionBanner({ text: t('pages.events.printWindowOpened'), variant: 'success' });
    } catch (err) {
      console.warn('Ошибка печати журнала:', err);
      setActionBanner({ text: t('pages.events.printFailed'), variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  // Вычисляем, есть ли еще записи
  const hasMoreRecords = (totalRecords > 0 && (offset + limit) < totalRecords) ||
    ((totalRecords === 0) && ((events?.records?.length || 0) >= limit));
  const hasPrevious = offset > 0;
  
  // Вычисляем реальное количество записей на текущей странице
  // Это важно для правильного отображения в пагинации
  // Используем totalRecords для определения реального количества, а не events.count от API
  const actualCountOnPage = events?.records?.length || 0;
  const totalForPagination = totalRecords > 0
    ? totalRecords
    : Math.max(offset + actualCountOnPage + (hasMoreRecords ? 1 : 0), actualCountOnPage);

  return (
    <div className="monitoring-events">
      <div className="page-header">
        <h1>{t('pages.events.title')}</h1>
        <p>{t('pages.events.subtitle')}</p>
      </div>

      {/* Панель фильтров */}
      <div className="filters-section">
        <EventsFilterBar filters={filters} onFilterChange={setFilters} onRefresh={handleRefresh} />
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <Button variant="secondary" size="small" onClick={handleSaveJournal} disabled={actionLoading}>
            {t('pages.events.saveJournal')}
          </Button>
          <Button variant="secondary" size="small" onClick={handlePrintJournal} disabled={actionLoading}>
            {t('pages.events.printJournal')}
          </Button>
          <Button variant="danger" size="small" onClick={() => setShowClearConfirm(true)} disabled={actionLoading}>
            {t('pages.events.clearJournal')}
          </Button>
        </div>
        {actionBanner && (
          <div
            className={`events-action-banner events-action-banner--${actionBanner.variant}`}
            role="status"
          >
            {actionBanner.variant === 'success' ? (
              <>✅ {actionBanner.text}</>
            ) : (
              actionBanner.text
            )}
          </div>
        )}
      </div>

      {/* Информация о количестве событий */}
      {!loading && events && (
        <div className="events-info">
          <p>
            {t('pages.events.recordsOnPage')}: <strong>
              {actualCountOnPage}
            </strong>
            {totalRecords > 0 && (
              <span style={{ fontSize: '0.875rem', opacity: 0.7, marginLeft: '0.5rem' }}>
                {t('pages.events.recordsTotal').replace('{count}', String(totalRecords))}
              </span>
            )}
            {events.offset !== undefined && events.offset > 0 && (
              <span> ({t('pages.events.shownFrom').replace('{index}', String(events.offset + 1))})</span>
            )}
            {hasMoreRecords && <span> ({t('pages.events.hasMore')})</span>}
            {events.error !== undefined && events.error > 0 && (
              <span style={{ color: 'var(--color-error)', marginLeft: '1rem' }}>
                ⚠️ {t('pages.events.journalErrorCode').replace('{code}', String(events.error))}
                {events.errorMsg && ` (${events.errorMsg})`}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Состояние загрузки — при первой загрузке журнал может открываться до 30 секунд */}
      {loading && !events && (
        <div className="loading-state">
          <p>{t('pages.events.loadingLong')}</p>
          <p style={{ fontSize: '0.875rem', opacity: 0.7, marginTop: '0.5rem' }}>
            {t('pages.events.loadingHint')}
          </p>
        </div>
      )}

      {/* Сообщение, если журнал не загрузился — без формулировки «ошибка сети», с предложением подождать и обновить */}
      {error && !events && (
        <div className="error-state">
          <h3>{t('pages.events.notLoaded')}</h3>
          <p>{t('pages.events.retryHint')}</p>
          <Button variant="primary" onClick={() => refetch(false)}>
            {t('common.refresh')}
          </Button>
        </div>
      )}

      {/* Таблица событий - показываем если есть данные, даже при ошибке автообновления */}
      {events && (
        <div className="events-table-section">
          <EventsTable
            events={events}
            filters={filters}
            offset={offset}
            totalRecords={totalRecords}
            doorMetaByGlobalId={doorMetaByGlobalId}
          />
          {/* Показываем предупреждение об ошибке автообновления, но не скрываем таблицу */}
          {error && events && (
            <div className="warning-state" style={{ marginTop: '1rem', padding: '0.5rem', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>
                {t('pages.events.autoRefreshWarn')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Пагинация */}
      {!loading && !error && events && events.records && events.records.length > 0 && (
        <div className="pagination-section">
          <Pagination
            offset={offset}
            limit={limit}
            count={actualCountOnPage}
            total={totalForPagination}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onFirstPage={handleFirstPage}
            onPageClick={handlePageClick}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      )}

      {/* Нет данных */}
      {!loading && !error && (!events || !events.records || events.records.length === 0) && (
        <div className="no-data-state">
          <p>{t('pages.events.noData')}</p>
        </div>
      )}

      <Modal
        isOpen={showClearConfirm}
        type="confirm"
        title={t('pages.events.clearDialogTitle')}
        message={t('pages.events.clearDialogMessage')}
        confirmText={actionLoading ? t('pages.events.clearing') : t('pages.events.clearDialogConfirm')}
        cancelText={t('common.cancel')}
        onConfirm={handleClearJournal}
        onCancel={() => {
          if (!actionLoading) setShowClearConfirm(false);
        }}
      />
    </div>
  );
};

export default Events;
