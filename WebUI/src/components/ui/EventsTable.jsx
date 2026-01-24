/**
 * EventsTable компонент - таблица событий журнала
 * Оптимизирован с React.memo для предотвращения лишних перерисовок
 */

import { memo } from 'react';
import Table from '../common/Table';
import { formatTimestamp, formatRelativeTime } from '../../utils/formatters';

const EventsTable = memo(({ events, filters = {} }) => {
  if (!events || !events.records || events.records.length === 0) {
    return <p>Нет событий</p>;
  }

  // Применяем фильтры
  let filteredEvents = events.records;

  // Фильтр по типу события
  if (filters.eventType && filters.eventType !== 'all') {
    filteredEvents = filteredEvents.filter(
      (event) => event.type === filters.eventType || event.typeCode === parseInt(filters.eventType, 10)
    );
  }

  // Фильтр по двери
  if (filters.doorId) {
    const doorId = parseInt(filters.doorId, 10);
    if (!isNaN(doorId)) {
      filteredEvents = filteredEvents.filter((event) => event.doorId === doorId);
    }
  }

  // Фильтр по источнику
  if (filters.source && filters.source !== 'all') {
    filteredEvents = filteredEvents.filter(
      (event) => event.source === filters.source || event.sourceCode === parseInt(filters.source, 10)
    );
  }

  // Определяем колонки таблицы
  const columns = [
    { key: 'recSeq', label: '№' },
    { key: 'timestamp', label: 'Время' },
    { key: 'type', label: 'Тип события' },
    { key: 'doorId', label: 'Дверь' },
    { key: 'source', label: 'Источник' },
    { key: 'flags', label: 'Флаги' },
    { key: 'arg', label: 'Аргумент' },
  ];

  // Формируем данные для таблицы
  const tableData = filteredEvents.map((event) => ({
    recSeq: event.recSeq || '—',
    timestamp: (
      <div>
        <div>{formatTimestamp(event.timestamp)}</div>
        <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>
          {formatRelativeTime(event.timestamp)}
        </div>
      </div>
    ),
    type: (
      <div>
        <div style={{ fontWeight: 600 }}>{event.type || '—'}</div>
        {event.typeCode !== undefined && (
          <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>
            Код: {event.typeCode}
          </div>
        )}
      </div>
    ),
    doorId: event.doorId || '—',
    source: (
      <div>
        <div>{event.source || '—'}</div>
        {event.sourceCode !== undefined && (
          <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>
            Код: {event.sourceCode}
          </div>
        )}
      </div>
    ),
    flags: event.flags !== undefined ? `0x${event.flags.toString(16)}` : '—',
    arg: event.arg !== undefined ? event.arg : '—',
  }));

  return (
    <div className="events-table">
      <Table columns={columns} data={tableData} className="events-table-content" />
      {filteredEvents.length === 0 && (
        <p className="no-results">Нет событий, соответствующих выбранным фильтрам</p>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Кастомная функция сравнения для оптимизации
  // Перерисовываем только если изменились данные или фильтры
  if (prevProps.events !== nextProps.events) {
    // Сравниваем содержимое массивов событий
    const prevRecords = prevProps.events?.records || [];
    const nextRecords = nextProps.events?.records || [];
    if (prevRecords.length !== nextRecords.length) return false;
    if (JSON.stringify(prevRecords) !== JSON.stringify(nextRecords)) return false;
  }
  
  if (JSON.stringify(prevProps.filters) !== JSON.stringify(nextProps.filters)) {
    return false;
  }
  
  return true; // Пропсы не изменились, не перерисовываем
});

EventsTable.displayName = 'EventsTable';

export default EventsTable;
