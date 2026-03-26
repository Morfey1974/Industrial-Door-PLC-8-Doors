/**
 * DoorsTab - вкладка настройки дверей
 *
 * Реализует:
 * - Таблицу всех дверей
 * - Добавление новой двери
 * - Редактирование существующей двери
 * - Удаление двери
 * - Фильтрацию по плате
 */

import { useState, useMemo } from 'react';
import Button from '../../../components/common/Button';
import { useLanguage } from '../../../context/LanguageContext';
import { calculateGlobalDoorId, validateDoor } from '../../../utils/configValidator';
import DoorEditModal from './DoorEditModal';

const DoorsTab = ({ config, updateConfig, loading, showConfirm }) => {
  const { t } = useLanguage();
  const [editingDoor, setEditingDoor] = useState(null);
  const [filterNodeId, setFilterNodeId] = useState('all');

  const doors = config.doors || [];

  const filteredDoors = useMemo(() => {
    if (filterNodeId === 'all') return doors;
    const nodeId = parseInt(filterNodeId, 10);
    return doors.filter((door) => door.nodeId === nodeId);
  }, [doors, filterNodeId]);

  /* Совпадает с CFG_FULL_MAX_DOORS_V1 на контроллере (PUT /api/config/full). */
  const MAX_DOORS_V1 = 40;

  const notifyMaxDoors = () => {
    const msg = t('pages.config.doorsMaxReached');
    if (showConfirm) {
      showConfirm(msg, t('pages.config.errorTitle'));
    } else {
      alert(msg);
    }
  };

  const handleAddDoor = () => {
    if (doors.length >= MAX_DOORS_V1) {
      notifyMaxDoors();
      return;
    }
    let newNodeId = 1;
    let newLocalDoor = 1;
    let found = false;
    /* До 10 плат по ТЗ; иначе при 5+ платах «Добавить дверь» не находило бы слоты на узлах 5–10. */
    const maxNodes = 10;
    for (let nodeId = 1; nodeId <= maxNodes && !found; nodeId++) {
      for (let localDoor = 1; localDoor <= 8; localDoor++) {
        const exists = doors.some((d) => d.nodeId === nodeId && d.localDoor === localDoor);
        if (!exists) {
          newNodeId = nodeId;
          newLocalDoor = localDoor;
          found = true;
          break;
        }
      }
    }

    if (!found) {
      notifyMaxDoors();
      return;
    }

    const newDoor = {
      techId: doors.length > 0 ? Math.max(...doors.map((d) => d.techId || 0)) + 1 : 1,
      drawingId: 0,
      nodeId: newNodeId,
      localDoor: newLocalDoor,
      globalDoorId: calculateGlobalDoorId(newNodeId, newLocalDoor),
      type: 'NO',
      typeCode: 1,
      comment: '',
    };

    setEditingDoor(newDoor);
  };

  const handleEditDoor = (door) => {
    setEditingDoor({ ...door });
  };

  const handleSaveDoor = (doorData) => {
    const editingDoorTechId = editingDoor ? editingDoor.techId : null;
    const validation = validateDoor(doorData, doors.filter((d) => d.techId !== editingDoorTechId), { t });
    if (!validation.valid) {
      alert(`${t('pages.doorsTab.validationFailedTitle')}:\n${validation.errors.join('\n')}`);
      return false;
    }

    if (!doorData.globalDoorId) {
      doorData.globalDoorId = calculateGlobalDoorId(doorData.nodeId, doorData.localDoor);
    }

    if (!doorData.typeCode) {
      if (doorData.type === 'NC') doorData.typeCode = 0;
      else if (doorData.type === 'NO') doorData.typeCode = 1;
      else doorData.typeCode = 0;
    }

    const updatedDoors = [...doors];

    const editingDoorIndex = editingDoor
      ? updatedDoors.findIndex((d) => d.techId === editingDoor.techId)
      : -1;

    const conflictingDoor = updatedDoors.find(
      (d) =>
        d.nodeId === doorData.nodeId &&
        d.localDoor === doorData.localDoor &&
        d.techId !== editingDoor?.techId
    );

    if (conflictingDoor) {
      alert(t('pages.doorsTab.doorConflict'));
      return false;
    }

    if (editingDoorIndex >= 0) {
      updatedDoors[editingDoorIndex] = doorData;
    } else {
      updatedDoors.push(doorData);
    }

    updateConfig({ doors: updatedDoors });
    setEditingDoor(null);
    return true;
  };

  const handleDeleteDoor = async (door) => {
    const ask = t('pages.config.deleteDoorAsk', { node: door.nodeId, local: door.localDoor });
    if (!showConfirm) {
      if (!window.confirm(ask)) {
        return;
      }
    } else {
      const confirmed = await showConfirm(ask, t('pages.config.deleteDoorTitle'));
      if (!confirmed) {
        return;
      }
    }

    const hasDependencies = (config.edges || []).some(
      (edge) => edge.srcGlobalDoorId === door.globalDoorId || edge.dstGlobalDoorId === door.globalDoorId
    );

    if (hasDependencies) {
      const depsAsk = t('pages.config.deleteDepsAlsoAsk');
      if (!showConfirm) {
        if (!window.confirm(depsAsk)) {
          return;
        }
      } else {
        const confirmedDeps = await showConfirm(depsAsk, t('pages.config.deleteDepsTitle'));
        if (!confirmedDeps) {
          return;
        }
      }
      const updatedEdges = (config.edges || []).filter(
        (edge) => edge.srcGlobalDoorId !== door.globalDoorId && edge.dstGlobalDoorId !== door.globalDoorId
      );
      updateConfig({ edges: updatedEdges });
    }

    const updatedTimeouts = (config.postCloseTimeouts || []).filter(
      (item) => item.globalDoorId !== door.globalDoorId
    );

    const updatedDoors = doors.filter(
      (d) => !(d.nodeId === door.nodeId && d.localDoor === door.localDoor)
    );

    updateConfig({
      doors: updatedDoors,
      postCloseTimeouts: updatedTimeouts,
    });
  };

  const availableNodeIds = useMemo(() => {
    const nodeIds = new Set(doors.map((d) => d.nodeId));
    return Array.from(nodeIds).sort((a, b) => a - b);
  }, [doors]);

  return (
    <div className="doors-tab">
      <div className="doors-tab-header">
        <h2>
          {t('pages.doorsTab.doorsCount', {
            filtered: String(filteredDoors.length),
            total: String(doors.length),
          })}
        </h2>
        <div className="doors-tab-controls">
          <select
            value={filterNodeId}
            onChange={(e) => setFilterNodeId(e.target.value)}
            className="filter-select"
            disabled={loading}
          >
            <option value="all">{t('pages.doorsTab.allBoards')}</option>
            {availableNodeIds.map((nodeId) => (
              <option key={nodeId} value={nodeId}>
                {t('pages.doorsTab.board', { id: nodeId })}
              </option>
            ))}
          </select>
          <Button onClick={handleAddDoor} variant="primary" disabled={loading}>
            + {t('pages.doorsTab.addDoor')}
          </Button>
        </div>
      </div>

      {filteredDoors.length === 0 ? (
        <div className="empty-state">
          <p>{t('pages.doorsTab.empty')}</p>
        </div>
      ) : (
        <div className="doors-table-container">
          <table className="doors-config-table">
            <thead>
              <tr>
                <th>{t('pages.doorsTab.colBoard')}</th>
                <th>{t('pages.doorsTab.colDoor')}</th>
                <th>{t('pages.doorsTab.colGlobalId')}</th>
                <th>{t('pages.doorsTab.colSeq')}</th>
                <th>{t('pages.doorsTab.colDrawingId')}</th>
                <th>{t('pages.doorsTab.colState')}</th>
                <th>{t('pages.doorsTab.colComment')}</th>
                <th>{t('pages.doorsTab.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredDoors.map((door) => (
                <tr key={`${door.nodeId}-${door.localDoor}-${door.techId}`}>
                  <td>{door.nodeId}</td>
                  <td>{door.localDoor}</td>
                  <td>ID-{door.nodeId}-{door.localDoor}</td>
                  <td>{door.techId}</td>
                  <td>{door.drawingId || '-'}</td>
                  <td>{door.type || 'NC'}</td>
                  <td>{door.comment || '-'}</td>
                  <td>
                    <Button
                      onClick={() => handleEditDoor(door)}
                      variant="secondary"
                      size="small"
                    >
                      ✏️
                    </Button>
                    <Button
                      onClick={() => handleDeleteDoor(door)}
                      variant="secondary"
                      size="small"
                    >
                      🗑️
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingDoor && (
        <DoorEditModal
          door={editingDoor}
          existingDoors={doors.filter((d) => d.techId !== editingDoor.techId)}
          onSave={handleSaveDoor}
          onCancel={() => setEditingDoor(null)}
        />
      )}
    </div>
  );
};

export default DoorsTab;
