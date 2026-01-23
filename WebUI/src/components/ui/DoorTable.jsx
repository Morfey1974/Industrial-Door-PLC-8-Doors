/**
 * DoorTable компонент - полная таблица состояния дверей
 */

import Table from '../common/Table';
import StatusBadge from './StatusBadge';
import { getDoorStatusText, formatUptime } from '../../utils/formatters';

const DoorTable = ({ doors, filters = {} }) => {
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

  // Фильтр по ID двери
  if (filters.doorId) {
    const doorId = parseInt(filters.doorId, 10);
    if (!isNaN(doorId)) {
      filteredDoors = filteredDoors.filter((door) => door.id === doorId);
    }
  }

  // Определяем колонки таблицы
  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'status', label: 'Статус' },
    { key: 'physClosed', label: 'Физически закрыта' },
    { key: 'locked', label: 'Замок' },
    { key: 'alarming', label: 'Авария' },
    { key: 'alarmReasons', label: 'Причины аварии' },
    { key: 'openSeconds', label: 'Открыта (сек)' },
    { key: 'closeDelay', label: 'Задержка закрытия (сек)' },
  ];

  // Формируем данные для таблицы
  const tableData = filteredDoors.map((door) => ({
    id: door.id,
    status: (
      <StatusBadge
        status={door.alarming ? 'alarm' : !door.physClosed ? 'open' : door.locked ? 'locked' : 'normal'}
        label={getDoorStatusText(door)}
      />
    ),
    physClosed: door.physClosed ? 'Да' : 'Нет',
    locked: door.locked ? 'Заблокирована' : 'Разблокирована',
    alarming: door.alarming ? (
      <StatusBadge status="alarm" label="Авария" />
    ) : (
      <StatusBadge status="normal" label="Норма" />
    ),
    alarmReasons: door.alarmReasons ? `0x${door.alarmReasons.toString(16)}` : '—',
    openSeconds: door.openSeconds > 0 ? formatUptime(door.openSeconds) : '—',
    closeDelay: door.closeDelayRemainingSeconds > 0 ? door.closeDelayRemainingSeconds : '—',
  }));

  return (
    <div className="door-table">
      <Table columns={columns} data={tableData} className="doors-table" />
      {filteredDoors.length === 0 && (
        <p className="no-results">Нет дверей, соответствующих выбранным фильтрам</p>
      )}
    </div>
  );
};

export default DoorTable;
