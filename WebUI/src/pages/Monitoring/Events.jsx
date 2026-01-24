/**
 * Events страница - журнал событий
 */

import { useState, useCallback } from 'react';
import useApi from '../../hooks/useApi';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import { getJournalDump } from '../../services/api';
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

  // Функция для получения событий с учетом offset и limit
  // signal передается автоматически из useApi
  const fetchEvents = useCallback((signal) => {
    return getJournalDump(offset, limit, signal);
  }, [offset, limit]);

  // Получаем события
  const { data: events, loading, error, refetch } = useApi(fetchEvents, [offset, limit]);

  // Автообновление каждые 10 секунд (только если нет активных фильтров)
  const hasActiveFilters =
    (filters.eventType && filters.eventType !== 'all') ||
    filters.doorId ||
    (filters.source && filters.source !== 'all');

  useAutoRefresh(() => {
    if (!hasActiveFilters) {
      // Используем тихое обновление, чтобы не показывать состояние загрузки
      refetch(true);
    }
  }, 10000);

  // Обработчики пагинации
  const handlePrevious = () => {
    const newOffset = Math.max(0, offset - limit);
    setOffset(newOffset);
  };

  const handleNext = () => {
    if (events && events.count === limit) {
      // Если получили полную страницу, значит есть еще данные
      setOffset(offset + limit);
    }
  };

  const handlePageSizeChange = (newLimit) => {
    setLimit(newLimit);
    setOffset(0); // Сбрасываем на первую страницу при изменении размера
  };

  // Вычисляем, есть ли еще записи
  // Если count === limit, значит могут быть еще данные
  // Если count < limit, значит это последняя страница
  const hasMoreRecords = events && events.count === limit;
  
  // Приблизительное общее количество для отображения
  // Если это не последняя страница, показываем оценку
  const totalRecords = events
    ? hasMoreRecords
      ? offset + events.count + 1 // Минимум еще одна запись
      : offset + events.count // Точное количество
    : 0;

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
            Событий на странице: <strong>{events.count || 0}</strong>
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
          <EventsTable events={events} filters={filters} />
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
      {!loading && !error && events && events.records && events.records.length > 0 && (
        <div className="pagination-section">
          <Pagination
            offset={offset}
            limit={limit}
            count={events.count || 0}
            total={hasMoreRecords ? totalRecords : offset + events.count}
            onPrevious={handlePrevious}
            onNext={handleNext}
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
