/**
 * DoorsOverview компонент - краткий обзор дверей
 */

import Table from '../common/Table';
import StatusBadge from './StatusBadge';
import { getDoorStatusColor, getDoorStatusText } from '../../utils/formatters';

const DoorsOverview = ({ doors, maxDoors = 8 }) => {
  if (!doors) {
    return <p>Нет данных о дверях</p>;
  }
  
  if (!doors.doors || doors.doors.length === 0) {
    return <p>Нет данных о дверях</p>;
  }

  // Берем первые maxDoors дверей
  const displayedDoors = doors.doors.slice(0, maxDoors);

  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'status', label: 'Статус' },
    { key: 'locked', label: 'Замок' },
    { key: 'openSeconds', label: 'Открыта (сек)' },
  ];

  const tableData = displayedDoors.map((door) => ({
    id: door.id,
    status: (
      <StatusBadge
        status={door.alarming ? 'alarm' : door.physClosed ? 'normal' : 'open'}
        label={getDoorStatusText(door)}
      />
    ),
    locked: door.locked ? 'Заблокирована' : 'Разблокирована',
    openSeconds: door.openSeconds > 0 ? door.openSeconds : '—',
  }));

  return (
    <div className="doors-overview">
      <h3>Обзор дверей (первые {displayedDoors.length})</h3>
      <Table columns={columns} data={tableData} />
    </div>
  );
};

export default DoorsOverview;
