/**
 * DoorsOverview компонент - краткий обзор дверей с группировкой по платам
 */

import Table from '../common/Table';
import StatusBadge from './StatusBadge';
import { formatDoorId } from '../../utils/formatters';
import { useLanguage } from '../../context/LanguageContext';

const getDoorStatusTextLocalized = (door, t) => {
  if (door.alarming) return t('pages.doors.statusAlarm');
  if (!door.physClosed) return t('pages.doors.statusOpen');
  if (door.locked) return t('pages.doors.statusLocked');
  return t('pages.doors.statusClosed');
};

const DoorsOverview = ({ doors }) => {
  const { t } = useLanguage();
  if (!doors) {
    return <p>{t('pages.doors.noData')}</p>;
  }
  
  if (!doors.doors || doors.doors.length === 0) {
    return <p>{t('pages.doors.noData')}</p>;
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
    { key: 'id', label: 'ID' },
    { key: 'status', label: t('pages.doors.colStatus') },
    { key: 'locked', label: t('pages.doors.colLock') },
    { key: 'openSeconds', label: t('pages.doors.colOpenSeconds') },
  ];

  return (
    <div className="doors-overview">
      {sortedNodeIds.map((nodeId) => {
        const nodeDoors = doorsByNode[nodeId];
        const tableData = nodeDoors.map((door) => ({
          id: formatDoorId(door),
          status: (
            <StatusBadge
              status={door.alarming ? 'alarm' : !door.physClosed ? 'open' : door.locked ? 'locked' : 'normal'}
              label={getDoorStatusTextLocalized(door, t)}
            />
          ),
          locked: door.locked ? t('pages.doors.lockedValue') : t('pages.doors.unlockedValue'),
          openSeconds: door.openSeconds > 0 ? door.openSeconds : '—',
        }));

        return (
          <div key={nodeId} style={{ marginBottom: '30px' }}>
            <h3 style={{ marginBottom: '10px', fontSize: '16px', fontWeight: '600' }}>
              {t('pages.doors.boardTitle').replace('{id}', String(nodeId))} ({nodeDoors.length} {nodeDoors.length === 1 ? t('pages.doors.oneDoor') : t('pages.doors.manyDoors')})
            </h3>
            <Table columns={columns} data={tableData} />
          </div>
        );
      })}
    </div>
  );
};

export default DoorsOverview;
