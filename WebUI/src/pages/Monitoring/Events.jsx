/**
 * Events страница - журнал событий
 */

import { useState, useCallback, useEffect } from 'react';
import useApi from '../../hooks/useApi';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import { getJournalDump, getJournalStat } from '../../services/api';
import EventsTable from '../../components/ui/EventsTable';
import EventsFilterBar from '../../components/ui/EventsFilterBar';
import Pagination from '../../components/ui/Pagination';
import Button from '../../components/common/Button';

const Events = () => {
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(20);
  const [filters, setFilters] = useState({
    eventType: 'all',
    doorId: '',
    source: 'all',
  });
  const [totalRecords, setTotalRecords] = useState(0); // Реальное количество записей из журнала
  const [refreshKey, setRefreshKey] = useState(0); // Ключ для принудительного обновления при изменении limit

  // Функция для получения статистики журнала (для получения общего количества записей)
  const fetchJournalStat = useCallback((signal) => {
    return getJournalStat(signal);
  }, []);

  // Получаем статистику журнала для определения общего количества записей
  const { data: journalStat, loading: statLoading, refetch: refetchStat } = useApi(fetchJournalStat, []);

  // Обновляем totalRecords при получении статистики
  useEffect(() => {
    if (journalStat && journalStat.recordsWritten !== undefined) {
      setTotalRecords(journalStat.recordsWritten);
    }
  }, [journalStat]);

  // Функция для получения событий с учетом offset и limit
  // signal передается автоматически из useApi
  // ВАЖНО: если limit >= totalRecords и offset=0, запрашиваем все записи (limit = totalRecords)
  // Это гарантирует, что при выборе "50" или "100" записей мы получим все доступные записи
  const fetchEvents = useCallback((signal) => {
    // Вычисляем реальный limit для запроса
    // ВАЖНО: API ограничивает limit до 50 записей из-за размера буфера (8KB)
    let actualLimit = limit;
    
    // Ограничиваем максимумом API (50 записей)
    if (actualLimit > 50) {
      actualLimit = 50;
    }
    
    // Если мы на первой странице (offset=0) и totalRecords известен
    if (offset === 0 && totalRecords > 0) {
      // Если limit >= totalRecords, запрашиваем все записи (но не больше 50)
      if (limit >= totalRecords && totalRecords <= 50) {
        actualLimit = totalRecords;
      }
    }
    
    // Отладочная информация
    console.log('[Events] fetchEvents: offset=', offset, 'limit=', limit, 'totalRecords=', totalRecords, 'actualLimit=', actualLimit);
    
    return getJournalDump(offset, actualLimit, signal);
  }, [offset, limit, totalRecords]);

  // Получаем события
  // ВАЖНО: dependencies включают totalRecords и refreshKey, чтобы при их изменении перезапросить данные
  // refreshKey используется для принудительного обновления при изменении limit
  const { data: events, loading, error, refetch } = useApi(fetchEvents, [offset, limit, totalRecords, refreshKey]);

  // Автообновление каждые 10 секунд (только если нет активных фильтров)
  const hasActiveFilters =
    (filters.eventType && filters.eventType !== 'all') ||
    filters.doorId ||
    (filters.source && filters.source !== 'all');

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
  }, 10000);

  // Обработчики пагинации
  const handlePrevious = () => {
    const newOffset = Math.max(0, offset - limit);
    setOffset(newOffset);
  };

  const handleNext = () => {
    // Проверяем, есть ли еще записи после текущей страницы
    if (offset + limit < totalRecords) {
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

  // Вычисляем, есть ли еще записи
  const hasMoreRecords = totalRecords > 0 && (offset + limit) < totalRecords;
  const hasPrevious = offset > 0;
  
  // Вычисляем реальное количество записей на текущей странице
  // Это важно для правильного отображения в пагинации
  // Используем totalRecords для определения реального количества, а не events.count от API
  const actualCountOnPage = totalRecords > 0
    ? Math.min(events?.records?.length || 0, Math.max(0, totalRecords - offset))
    : (events?.count || events?.records?.length || 0);

  return (
    <div className="monitoring-events">
      <div className="page-header">
        <h1>Журнал событий</h1>
        <p>История всех событий системы с возможностью фильтрации и пагинации</p>
      </div>

      {/* Панель фильтров */}
      <div className="filters-section">
        <EventsFilterBar filters={filters} onFilterChange={setFilters} />
      </div>

      {/* Информация о количестве событий */}
      {!loading && !error && events && (
        <div className="events-info">
          <p>
            Событий на странице: <strong>
              {totalRecords > 0 
                ? Math.min(events.count || 0, Math.max(0, totalRecords - offset))
                : (events.count || 0)
              }
            </strong>
            {totalRecords > 0 && (
              <span style={{ fontSize: '0.875rem', opacity: 0.7, marginLeft: '0.5rem' }}>
                из {totalRecords} всего
              </span>
            )}
            {events.offset !== undefined && events.offset > 0 && (
              <span> (показано с {events.offset + 1})</span>
            )}
            {hasMoreRecords && <span> (есть еще данные)</span>}
            {events.error !== undefined && events.error > 0 && (
              <span style={{ color: 'var(--color-error)', marginLeft: '1rem' }}>
                ⚠️ Ошибка журнала: код {events.error}
                {events.errorMsg && ` (${events.errorMsg})`}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Состояние загрузки - показываем только при первой загрузке */}
      {loading && !events && (
        <div className="loading-state">
          <p>Загрузка событий...</p>
          <p style={{ fontSize: '0.875rem', opacity: 0.7, marginTop: '0.5rem' }}>
            Это может занять до 30 секунд. Если загрузка не завершается, проверьте подключение к контроллеру.
          </p>
        </div>
      )}

      {/* Обработка ошибок - показываем только если нет данных */}
      {error && !events && (
        <div className="error-state">
          <h3>Ошибка загрузки данных</h3>
          <p>{error}</p>
          <p>Проверьте, что контроллер доступен по адресу: http://192.168.1.50</p>
          <Button variant="primary" onClick={() => refetch(false)}>
            Повторить попытку
          </Button>
        </div>
      )}

      {/* Таблица событий - показываем если есть данные, даже при ошибке автообновления */}
      {events && (
        <div className="events-table-section">
          <EventsTable events={events} filters={filters} offset={offset} totalRecords={totalRecords} />
          {/* Показываем предупреждение об ошибке автообновления, но не скрываем таблицу */}
          {error && events && (
            <div className="warning-state" style={{ marginTop: '1rem', padding: '0.5rem', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>
                ⚠️ Ошибка автообновления: {error}. Данные могут быть устаревшими.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Пагинация */}
      {!loading && !error && events && events.records && events.records.length > 0 && totalRecords > 0 && (
        <div className="pagination-section">
          <Pagination
            offset={offset}
            limit={limit}
            count={actualCountOnPage}
            total={totalRecords}
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
          <p>Нет событий в журнале</p>
        </div>
      )}
    </div>
  );
};

export default Events;
