/**
 * DoorsOverview компонент - краткий обзор дверей с группировкой по платам
 */

import Table from '../common/Table';
import StatusBadge from './StatusBadge';
import { getDoorStatusColor, getDoorStatusText } from '../../utils/formatters';

const DoorsOverview = ({ doors }) => {
  if (!doors) {
    return <p>Нет данных о дверях</p>;
  }
  
  if (!doors.doors || doors.doors.length === 0) {
    return <p>Нет данных о дверях</p>;
  }

  // Группируем двери по платам (nodeId)
  const doorsByNode = {};
  doors.doors.forEach((door) => {
    const nodeId = door.nodeId || 1; // По умолчанию плата 1
    if (!doorsByNode[nodeId]) {
      doorsByNode[nodeId] = [];
    }
    doorsByNode[nodeId].push(door);
  });

  // Сортируем платы по nodeId
  const sortedNodeIds = Object.keys(doorsByNode).sort((a, b) => parseInt(a) - parseInt(b));

  const columns = [
    { key: 'localDoor', label: 'Дверь' },
    { key: 'status', label: 'Статус' },
    { key: 'locked', label: 'Замок' },
    { key: 'openSeconds', label: 'Открыта (сек)' },
  ];

  return (
    <div className="doors-overview">
      {sortedNodeIds.map((nodeId) => {
        const nodeDoors = doorsByNode[nodeId];
        const tableData = nodeDoors.map((door) => ({
          localDoor: door.localDoor || door.id || '—',
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
          <div key={nodeId} style={{ marginBottom: '30px' }}>
            <h3 style={{ marginBottom: '10px', fontSize: '16px', fontWeight: '600' }}>
              Плата {nodeId} ({nodeDoors.length} {nodeDoors.length === 1 ? 'дверь' : 'дверей'})
            </h3>
            <Table columns={columns} data={tableData} />
          </div>
        );
      })}
    </div>
  );
};

export default DoorsOverview;
