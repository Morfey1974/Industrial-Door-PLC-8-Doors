/**
 * EventsTable компонент - таблица событий журнала
 * Оптимизирован с React.memo для предотвращения лишних перерисовок
 */

import { memo } from 'react';
import Table from '../common/Table';
import { formatTimestamp, formatDoorId, parseDoorIdFilter } from '../../utils/formatters';
import { formatJournalUserColumn } from '../../utils/journalUserDisplay';
import { useLanguage } from '../../context/LanguageContext';

const EventsTable = memo(({ events, filters = {}, offset = 0, totalRecords = 0, doorMetaByGlobalId = {} }) => {
  const { t } = useLanguage();
  if (!events || !events.records || events.records.length === 0) {
    return <p>{t('pages.events.noData')}</p>;
  }

  let recordsOnThisPage;
  if (totalRecords > 0) {
    const remainingRecords = totalRecords - offset;
    recordsOnThisPage = Math.max(0, Math.min(events.records.length, remainingRecords));
  } else {
    recordsOnThisPage = Math.min(events.records.length, events.count !== undefined ? events.count : events.records.length);
  }

  const columns = [
    { key: 'number', label: t('pages.events.colNumber'), style: { width: '60px' } },
    { key: 'timestamp', label: t('pages.events.colTime'), style: { width: '140px' } },
    { key: 'type', label: t('pages.events.colType'), style: { width: '150px' } },
    { key: 'username', label: t('pages.events.colUser'), style: { width: '120px' } },
    { key: 'doorId', label: t('pages.events.colDoorId'), style: { width: '100px' } },
    { key: 'drawingId', label: t('pages.events.colDrawingId'), style: { width: '100px' } },
  ];

  const recordsFromApi = events.records.slice(0, recordsOnThisPage);

  const validEvents = recordsFromApi.filter(event =>
    event &&
    (event.recSeq !== undefined || event.timestamp !== undefined || event.type !== undefined)
  );

  const sortedEvents = [...validEvents].sort((a, b) => {
    const aSeq = a?.recSeq ?? 0;
    const bSeq = b?.recSeq ?? 0;
    if (aSeq !== bSeq) return bSeq - aSeq;
    const aTs = a?.timestamp ?? 0;
    const bTs = b?.timestamp ?? 0;
    return bTs - aTs;
  });

  let filteredEvents = sortedEvents;

  if (filters.eventType && filters.eventType !== 'all') {
    filteredEvents = filteredEvents.filter(
      (event) => event.type === filters.eventType || event.typeCode === parseInt(filters.eventType, 10)
    );
  }

  if (filters.doorId) {
    const parsed = parseDoorIdFilter(filters.doorId);
    if (parsed) {
      filteredEvents = filteredEvents.filter(
        (event) => (event.nodeId ?? 1) === parsed.nodeId && (event.localDoor ?? event.doorId) === parsed.localDoor
      );
    }
  }

  const eventsToShow = filteredEvents.slice(0, recordsOnThisPage);

  if (eventsToShow.length > recordsOnThisPage) {
    console.error('[EventsTable] ERROR: eventsToShow.length (', eventsToShow.length, ') > recordsOnThisPage (', recordsOnThisPage, ')');
  }

  const tableData = eventsToShow.map((event, index) => {
    const sequentialNumber = offset + index + 1;

    const doorIdFormatted = (event.nodeId != null && event.localDoor != null)
      ? formatDoorId({ nodeId: event.nodeId, localDoor: event.localDoor })
      : (event.doorId !== undefined ? `ID-1-${event.doorId}` : '—');

    let globalDoorId = null;
    if (event.globalDoorId != null) {
      globalDoorId = Number(event.globalDoorId);
    } else if (event.nodeId != null && event.localDoor != null) {
      globalDoorId = ((Number(event.nodeId) - 1) * 8) + Number(event.localDoor);
    } else if (event.doorId != null) {
      globalDoorId = Number(event.doorId);
    }
    const doorMeta = (Number.isFinite(globalDoorId) && globalDoorId > 0)
      ? doorMetaByGlobalId[globalDoorId]
      : null;
    const draw = doorMeta?.drawingId;
    const hasDrawingNum =
      draw != null && draw !== '' && Number(draw) !== 0;
    const comment = doorMeta?.comment;
    const hasComment = typeof comment === 'string' && comment.trim() !== '';
    const drawingIdValue = hasDrawingNum
      ? String(draw)
      : (hasComment ? comment.trim() : '—');

    const typeDisplay = event.type || '—';

    return {
      number: sequentialNumber,
      timestamp: formatTimestamp(event.timestamp),
      type: typeDisplay,
      username: formatJournalUserColumn(event, t),
      doorId: doorIdFormatted,
      drawingId: drawingIdValue,
    };
  });

  return (
    <div className="events-table">
      <Table columns={columns} data={tableData} className="events-table-content" />
      {eventsToShow.length === 0 && (
        <p className="no-results">{t('pages.events.noMatching')}</p>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  if (prevProps.events !== nextProps.events) {
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

  if (prevProps.doorMetaByGlobalId !== nextProps.doorMetaByGlobalId) {
    return false;
  }

  return true;
});

EventsTable.displayName = 'EventsTable';

export default EventsTable;
