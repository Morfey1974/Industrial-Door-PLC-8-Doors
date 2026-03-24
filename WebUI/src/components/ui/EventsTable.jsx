/**
 * EventsTable компонент - таблица событий журнала
 * Оптимизирован с React.memo для предотвращения лишних перерисовок
 */

import { memo } from 'react';
import Table from '../common/Table';
import { formatTimestamp, formatRelativeTime, formatDoorId, parseDoorIdFilter } from '../../utils/formatters';

const EventsTable = memo(({ events, filters = {}, offset = 0, totalRecords = 0 }) => {
  if (!events || !events.records || events.records.length === 0) {
    return <p>Нет событий</p>;
  }

  // КРИТИЧЕСКИ ВАЖНО: используем totalRecords для определения реального количества записей
  // API может вернуть events.count больше, чем реально есть записей
  // Поэтому мы вычисляем, сколько записей должно быть на текущей странице на основе totalRecords
  
  // Вычисляем максимальное количество записей для текущей страницы на основе totalRecords
  // КРИТИЧЕСКИ ВАЖНО: используем totalRecords для определения реального количества записей
  // 
  // Проблема: API может вернуть меньше записей, чем запрошено (например, 10 вместо 50)
  // Решение: показываем все полученные записи, но не больше, чем totalRecords позволяет
  // 
  // Логика:
  // - Если totalRecords > 0: вычисляем сколько записей должно быть на этой странице
  // - Показываем минимум из: реально полученных записей (events.records.length) и оставшихся записей (totalRecords - offset)
  // 
  // Примеры:
  // - offset=0, limit=50, totalRecords=48, events.records.length=48 -> recordsOnThisPage = min(48, 48) = 48 ✓
  // - offset=0, limit=50, totalRecords=48, events.records.length=10 -> recordsOnThisPage = min(10, 48) = 10 (API вернул только 10, показываем 10)
  // - offset=0, limit=20, totalRecords=48, events.records.length=20 -> recordsOnThisPage = min(20, 48) = 20 ✓
  // - offset=20, limit=20, totalRecords=48, events.records.length=20 -> recordsOnThisPage = min(20, 28) = 20 ✓
  // - offset=40, limit=20, totalRecords=48, events.records.length=8 -> recordsOnThisPage = min(8, 8) = 8 ✓
  let recordsOnThisPage;
  if (totalRecords > 0) {
    // Вычисляем, сколько записей должно быть на этой странице
    const remainingRecords = totalRecords - offset;
    // Показываем минимум из: реально полученных записей и оставшихся записей
    // ВАЖНО: если API вернул меньше записей, чем запрошено, мы покажем только то, что получили
    // Но если API вернул правильное количество, покажем все
    recordsOnThisPage = Math.max(0, Math.min(events.records.length, remainingRecords));
  } else {
    // Fallback: если totalRecords еще не загружен, используем events.count или events.records.length
    recordsOnThisPage = Math.min(events.records.length, events.count !== undefined ? events.count : events.records.length);
  }

  // Определяем колонки таблицы (Пользователь — для событий из UI: вход, выход, сохранение конфига)
  const columns = [
    { key: 'number', label: '№', style: { width: '60px' } },
    { key: 'timestamp', label: 'Время', style: { width: '140px' } },
    { key: 'type', label: 'Тип события', style: { width: '150px' } },
    { key: 'username', label: 'Пользователь', style: { width: '120px' } },
    { key: 'doorId', label: 'ID двери', style: { width: '100px' } },
    { key: 'source', label: 'Источник', style: { width: '120px' } },
    { key: 'drawingId', label: 'DrawingId', style: { width: '100px' } },
    { key: 'arg', label: 'Аргумент', style: { width: '80px' } },
  ];

  // Формируем данные для таблицы
  // СТРОГО ограничиваем массив до recordsOnThisPage ПЕРЕД любой обработкой
  // Это гарантирует, что мы покажем только реально существующие записи
  const recordsFromApi = events.records.slice(0, recordsOnThisPage);
  
  // Фильтруем валидные записи (исключаем undefined, null, пустые объекты)
  const validEvents = recordsFromApi.filter(event =>
    event &&
    (event.recSeq !== undefined || event.timestamp !== undefined || event.type !== undefined)
  );
  
  // Защитная сортировка: даже если API/кэш отдаст смешанный порядок,
  // в таблице всегда показываем новые записи первыми.
  const sortedEvents = [...validEvents].sort((a, b) => {
    const aSeq = a?.recSeq ?? 0;
    const bSeq = b?.recSeq ?? 0;
    if (aSeq !== bSeq) return bSeq - aSeq;
    const aTs = a?.timestamp ?? 0;
    const bTs = b?.timestamp ?? 0;
    return bTs - aTs;
  });
  
  // Применяем фильтры к валидным записям
  let filteredEvents = sortedEvents;
  
  // Фильтр по типу события (если не "all")
  if (filters.eventType && filters.eventType !== 'all') {
    filteredEvents = filteredEvents.filter(
      (event) => event.type === filters.eventType || event.typeCode === parseInt(filters.eventType, 10)
    );
  }
  
  // Фильтр по двери (формат ID-1-1 или 1-1)
  if (filters.doorId) {
    const parsed = parseDoorIdFilter(filters.doorId);
    if (parsed) {
      filteredEvents = filteredEvents.filter(
        (event) => (event.nodeId ?? 1) === parsed.nodeId && (event.localDoor ?? event.doorId) === parsed.localDoor
      );
    }
  }
  
  // Фильтр по источнику (если не "all")
  if (filters.source && filters.source !== 'all') {
    filteredEvents = filteredEvents.filter(
      (event) => event.source === filters.source || event.sourceCode === parseInt(filters.source, 10)
    );
  }
  
  // ФИНАЛЬНОЕ ограничение: показываем ТОЛЬКО recordsOnThisPage записей
  // Это критично - даже если после фильтрации осталось больше записей,
  // мы показываем максимум столько, сколько реально есть на этой странице
  const eventsToShow = filteredEvents.slice(0, recordsOnThisPage);
  
  // Дополнительная проверка
  if (eventsToShow.length > recordsOnThisPage) {
    console.error('[EventsTable] ERROR: eventsToShow.length (', eventsToShow.length, ') > recordsOnThisPage (', recordsOnThisPage, ')');
  }
  
  const tableData = eventsToShow.map((event, index) => {
    // Порядковый номер = offset + index + 1 (начинаем с 1)
    // offset - это смещение для текущей страницы
    // index - это позиция в массиве eventsToShow (0, 1, 2...)
    const sequentialNumber = offset + index + 1;
    
    // ID двери: ID-{nodeId}-{localDoor}; в журнале может быть только doorId (локальный) — тогда ID-1-{doorId}
    const doorIdFormatted = (event.nodeId != null && event.localDoor != null)
      ? formatDoorId({ nodeId: event.nodeId, localDoor: event.localDoor })
      : (event.doorId !== undefined ? `ID-1-${event.doorId}` : '—');
    
    // Упрощаем отображение типа события (скрываем код или делаем менее заметным)
    const typeDisplay = event.type || '—';
    
    // Упрощаем отображение источника (скрываем код)
    const sourceDisplay = event.source || '—';
    
    return {
      number: sequentialNumber,
      timestamp: (
        <div>
          <div>{formatTimestamp(event.timestamp)}</div>
          <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
            {formatRelativeTime(event.timestamp)}
          </div>
        </div>
      ),
      type: typeDisplay,
      username: event.username && event.username.trim() ? event.username : '—',
      doorId: doorIdFormatted,
      source: sourceDisplay,
      drawingId: '—', // Пока заглушка, в будущем будет из конфига двери
      arg: event.arg !== undefined ? event.arg : '—',
    };
  });

  return (
    <div className="events-table">
      <Table columns={columns} data={tableData} className="events-table-content" />
      {eventsToShow.length === 0 && (
        <p className="no-results">Нет событий, соответствующих выбранным фильтрам</p>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Кастомная функция сравнения для оптимизации
  // Перерисовываем только если изменились данные, фильтры или offset
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
  
  if (prevProps.offset !== nextProps.offset) {
    return false;
  }
  
  if (prevProps.totalRecords !== nextProps.totalRecords) {
    return false;
  }
  
  return true; // Пропсы не изменились, не перерисовываем
});

EventsTable.displayName = 'EventsTable';

export default EventsTable;
