/**
 * DoorTable — таблица состояния дверей.
 * Без React.memo с кастомным сравнением: оно по JSON могло пропускать перерисовку при смене ссылок/полей с тем же текстом.
 */

import Table from '../common/Table';
import StatusBadge from './StatusBadge';
import { formatDoorId, parseDoorIdFilter } from '../../utils/formatters';
import { useLanguage } from '../../context/LanguageContext';

/* Человекочитаемая расшифровка bitmask alarmReasons из прошивки.
 * Биты:
 * - 0x1: manual alarm (кнопка Alarm)
 * - 0x2: open timeout (дверь слишком долго открыта)
 */
const formatAlarmReasons = (alarmReasons, t) => {
  const val = Number(alarmReasons) || 0;
  if (val === 0) return '—';

  const reasons = [];
  if (val & 0x1) reasons.push(t('pages.doors.alarmReasonManual'));
  if (val & 0x2) reasons.push(t('pages.doors.alarmReasonOpenTimeout'));

  /* На случай будущих причин (новые биты), чтобы не терять информацию. */
  const knownMask = 0x1 | 0x2;
  const unknown = val & ~knownMask;
  if (unknown) reasons.push(`UNKNOWN(0x${unknown.toString(16).toUpperCase()})`);

  return reasons.join(' + ');
};

/* Локализованный формат длительности для колонки "Открыта (сек)". */
const formatOpenDuration = (seconds, t) => {
  const total = Number(seconds) || 0;
  if (total <= 0) return '—';

  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}${t('pages.doors.timeUnitDays')}`);
  if (hours > 0) parts.push(`${hours}${t('pages.doors.timeUnitHours')}`);
  if (minutes > 0) parts.push(`${minutes}${t('pages.doors.timeUnitMinutes')}`);
  if (secs > 0 && parts.length === 0) parts.push(`${secs}${t('pages.doors.timeUnitSeconds')}`);
  return parts.join(' ');
};

const getDoorStatusTextLocalized = (door, t) => {
  if (door.alarming) return t('pages.doors.statusAlarm');
  if (!door.physClosed) return t('pages.doors.statusOpen');
  if (door.locked) return t('pages.doors.statusLocked');
  return t('pages.doors.statusClosed');
};

const DoorTable = ({ doors, filters = {} }) => {
  const { t } = useLanguage();
  if (!doors || !doors.doors || doors.doors.length === 0) {
    return <p>Нет данных о дверях</p>;
  }

  // Применяем фильтры
  let filteredDoors = doors.doors;

  // Фильтр по статусу
  if (filters.status && filters.status !== 'all') {
    filteredDoors = filteredDoors.filter((door) => {
      if (filters.status === 'open') return !door.physClosed;
      if (filters.status === 'closed') return door.physClosed && !door.alarming;
      if (filters.status === 'alarm') return door.alarming;
      if (filters.status === 'locked') return door.locked;
      return true;
    });
  }

  // Фильтр по ID двери (формат ID-1-1 или 1-1)
  if (filters.doorId) {
    const parsed = parseDoorIdFilter(filters.doorId);
    if (parsed) {
      filteredDoors = filteredDoors.filter(
        (door) => (door.nodeId ?? 1) === parsed.nodeId && (door.localDoor ?? door.id) === parsed.localDoor
      );
    }
  }

  // Группируем двери по платам (nodeId), как на главной странице
  const doorsByNode = {};
  filteredDoors.forEach((door) => {
    const nodeId = door.nodeId ?? 1;
    if (!doorsByNode[nodeId]) doorsByNode[nodeId] = [];
    doorsByNode[nodeId].push(door);
  });
  const sortedNodeIds = Object.keys(doorsByNode).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  // Определяем колонки таблицы
  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'status', label: t('pages.doors.colStatus') },
    { key: 'physClosed', label: t('pages.doors.colPhysClosed') },
    { key: 'locked', label: t('pages.doors.colLock') },
    { key: 'alarming', label: 'Alarm' },
    { key: 'alarmReasons', label: t('pages.doors.colAlarmReasons') },
    { key: 'openSeconds', label: t('pages.doors.colOpenSeconds') },
  ];

  const rowFromDoor = (door) => ({
    id: formatDoorId(door),
    status: (
      <StatusBadge
        status={door.alarming ? 'alarm' : !door.physClosed ? 'open' : door.locked ? 'locked' : 'normal'}
        label={getDoorStatusTextLocalized(door, t)}
      />
    ),
    physClosed: door.physClosed ? t('pages.doors.yes') : t('pages.doors.no'),
    locked: door.locked ? t('pages.doors.lockedValue') : t('pages.doors.unlockedValue'),
    /* «Норма» зелёным рядом с заблокированной NC-дверью выглядит как противоречие и «мигает» при дребезге API.
     * Для закрытой+замок без тревоги — нейтральный бейдж, не success-зелёный. */
    alarming: door.alarming ? (
      <StatusBadge status="alarm" label="Alarm" />
    ) : door.locked && door.physClosed ? (
      <StatusBadge status="idle" label={t('pages.doors.alarmColumnIdle')} />
    ) : (
      <StatusBadge status="normal" label={t('pages.doors.normal')} />
    ),
    alarmReasons: formatAlarmReasons(door.alarmReasons, t),
    openSeconds: formatOpenDuration(door.openSeconds, t),
  });

  if (filteredDoors.length === 0) {
    return (
      <div className="door-table">
        <p className="no-results">{t('pages.doors.noMatchingDoors')}</p>
      </div>
    );
  }

  return (
    <div className="door-table door-table-by-nodes">
      {sortedNodeIds.map((nodeId) => {
        const nodeDoors = doorsByNode[nodeId];
        const tableData = nodeDoors.map(rowFromDoor);
        return (
          <div key={nodeId} className="door-table-node-section" style={{ marginBottom: '24px' }}>
            <h3 className="door-table-node-title" style={{ marginBottom: '10px', fontSize: '16px', fontWeight: '600' }}>
              {t('pages.doors.boardTitle').replace('{id}', String(nodeId))} ({nodeDoors.length} {nodeDoors.length === 1 ? t('pages.doors.oneDoor') : t('pages.doors.manyDoors')})
            </h3>
            <Table columns={columns} data={tableData} className="doors-table" />
          </div>
        );
      })}
    </div>
  );
};

DoorTable.displayName = 'DoorTable';

export default DoorTable;
