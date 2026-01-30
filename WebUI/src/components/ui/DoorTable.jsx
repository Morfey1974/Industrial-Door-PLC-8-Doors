/**
 * DoorTable компонент - полная таблица состояния дверей
 * Оптимизирован с React.memo для предотвращения лишних перерисовок
 */

import { memo } from 'react';
import Table from '../common/Table';
import StatusBadge from './StatusBadge';
import { getDoorStatusText, formatUptime, formatDoorId, parseDoorIdFilter } from '../../utils/formatters';

const DoorTable = memo(({ doors, filters = {} }) => {
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
    { key: 'status', label: 'Статус' },
    { key: 'physClosed', label: 'Физически закрыта' },
    { key: 'locked', label: 'Замок' },
    { key: 'alarming', label: 'Alarm' },
    { key: 'alarmReasons', label: 'Причины аварии' },
    { key: 'openSeconds', label: 'Открыта (сек)' },
    { key: 'closeDelay', label: 'Задержка закрытия (сек)' },
  ];

  const rowFromDoor = (door) => ({
    id: formatDoorId(door),
    status: (
      <StatusBadge
        status={door.alarming ? 'alarm' : !door.physClosed ? 'open' : door.locked ? 'locked' : 'normal'}
        label={getDoorStatusText(door)}
      />
    ),
    physClosed: door.physClosed ? 'Да' : 'Нет',
    locked: door.locked ? 'Заблокирована' : 'Разблокирована',
    alarming: door.alarming ? (
      <StatusBadge status="alarm" label="Alarm" />
    ) : (
      <StatusBadge status="normal" label="Норма" />
    ),
    alarmReasons: door.alarmReasons ? `0x${door.alarmReasons.toString(16)}` : '—',
    openSeconds: door.openSeconds > 0 ? formatUptime(door.openSeconds) : '—',
    closeDelay: door.closeDelayRemainingSeconds > 0 ? door.closeDelayRemainingSeconds : '—',
  });

  if (filteredDoors.length === 0) {
    return (
      <div className="door-table">
        <p className="no-results">Нет дверей, соответствующих выбранным фильтрам</p>
      </div>
    );
  }

  return (
    <div className="door-table door-table-by-nodes">
      {sortedNodeIds.map((nodeId) => {
        const nodeDoors = doorsByNode[nodeId];
        const tableData = nodeDoors.map(rowFromDoor);
        const label = nodeDoors.length === 1 ? 'дверь' : 'дверей';
        return (
          <div key={nodeId} className="door-table-node-section" style={{ marginBottom: '24px' }}>
            <h3 className="door-table-node-title" style={{ marginBottom: '10px', fontSize: '16px', fontWeight: '600' }}>
              Плата {nodeId} ({nodeDoors.length} {label})
            </h3>
            <Table columns={columns} data={tableData} className="doors-table" />
          </div>
        );
      })}
    </div>
  );
}, (prevProps, nextProps) => {
  // Кастомная функция сравнения для оптимизации
  // Перерисовываем только если изменились данные или фильтры
  if (prevProps.doors !== nextProps.doors) {
    // Сравниваем содержимое массивов дверей
    const prevDoors = prevProps.doors?.doors || [];
    const nextDoors = nextProps.doors?.doors || [];
    if (prevDoors.length !== nextDoors.length) return false;
    if (JSON.stringify(prevDoors) !== JSON.stringify(nextDoors)) return false;
  }
  
  if (JSON.stringify(prevProps.filters) !== JSON.stringify(nextProps.filters)) {
    return false;
  }
  
  return true; // Пропсы не изменились, не перерисовываем
});

DoorTable.displayName = 'DoorTable';

export default DoorTable;
