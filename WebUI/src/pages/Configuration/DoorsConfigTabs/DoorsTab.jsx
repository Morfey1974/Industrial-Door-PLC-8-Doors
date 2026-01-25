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
import { calculateGlobalDoorId, validateDoor } from '../../../utils/configValidator';
import DoorEditModal from './DoorEditModal';

const DoorsTab = ({ config, updateConfig, loading }) => {
  const [editingDoor, setEditingDoor] = useState(null);
  const [filterNodeId, setFilterNodeId] = useState('all');
  
  const doors = config.doors || [];
  
  // Фильтрация дверей по плате
  const filteredDoors = useMemo(() => {
    if (filterNodeId === 'all') return doors;
    const nodeId = parseInt(filterNodeId, 10);
    return doors.filter(door => door.nodeId === nodeId);
  }, [doors, filterNodeId]);
  
  // Добавление новой двери
  const handleAddDoor = () => {
    // Находим свободную позицию (nodeId=1, localDoor=1-8)
    let newNodeId = 1;
    let newLocalDoor = 1;
    let found = false;
    
    for (let nodeId = 1; nodeId <= 10 && !found; nodeId++) {
      for (let localDoor = 1; localDoor <= 8; localDoor++) {
        const exists = doors.some(d => d.nodeId === nodeId && d.localDoor === localDoor);
        if (!exists) {
          newNodeId = nodeId;
          newLocalDoor = localDoor;
          found = true;
          break;
        }
      }
    }
    
    if (!found) {
      alert('Достигнут максимум дверей (80). Удалите существующие двери перед добавлением новых.');
      return;
    }
    
    const newDoor = {
      techId: doors.length > 0 ? Math.max(...doors.map(d => d.techId || 0)) + 1 : 1,
      drawingId: 0,
      nodeId: newNodeId,
      localDoor: newLocalDoor,
      globalDoorId: calculateGlobalDoorId(newNodeId, newLocalDoor),
      type: 'NC',
      typeCode: 0,
      comment: '',
    };
    
    setEditingDoor(newDoor);
  };
  
  // Редактирование двери
  const handleEditDoor = (door) => {
    setEditingDoor({ ...door });
  };
  
  // Сохранение двери (добавление или обновление)
  const handleSaveDoor = (doorData) => {
    // Валидация - исключаем текущую редактируемую дверь по techId
    const editingDoorTechId = editingDoor ? editingDoor.techId : null;
    const validation = validateDoor(doorData, doors.filter(d => d.techId !== editingDoorTechId));
    if (!validation.valid) {
      alert(`Ошибки валидации:\n${validation.errors.join('\n')}`);
      return false;
    }
    
    // Вычисляем globalDoorId если не указан
    if (!doorData.globalDoorId) {
      doorData.globalDoorId = calculateGlobalDoorId(doorData.nodeId, doorData.localDoor);
    }
    
    // Определяем typeCode из type
    if (!doorData.typeCode) {
      if (doorData.type === 'NC') doorData.typeCode = 0;
      else if (doorData.type === 'NO') doorData.typeCode = 1;
      else if (doorData.type === 'CARD_READER') doorData.typeCode = 2;
    }
    
    const updatedDoors = [...doors];
    
    // Ищем индекс редактируемой двери по techId (techId не должен меняться при редактировании)
    const editingDoorIndex = editingDoor ? updatedDoors.findIndex(
      d => d.techId === editingDoor.techId
    ) : -1;
    
    // Проверяем, не занят ли новый nodeId+localDoor другой дверью
    // (исключаем текущую редактируемую дверь из проверки)
    const conflictingDoor = updatedDoors.find(
      d => d.nodeId === doorData.nodeId && 
           d.localDoor === doorData.localDoor &&
           d.techId !== editingDoor?.techId // Исключаем текущую редактируемую дверь
    );
    
    if (conflictingDoor) {
      alert('Дверь с такой платой и позицией уже существует');
      return false;
    }
    
    // Обновляем или добавляем
    if (editingDoorIndex >= 0) {
      // Обновляем существующую дверь
      updatedDoors[editingDoorIndex] = doorData;
    } else {
      // Добавляем новую дверь
      updatedDoors.push(doorData);
    }
    
    updateConfig({ doors: updatedDoors });
    setEditingDoor(null);
    return true;
  };
  
  // Удаление двери
  const handleDeleteDoor = (door) => {
    if (!window.confirm(`Удалить дверь ID-${door.nodeId}-${door.localDoor}?`)) {
      return;
    }
    
    // Проверяем, нет ли зависимостей
    const hasDependencies = (config.edges || []).some(
      edge => edge.srcGlobalDoorId === door.globalDoorId || 
              edge.dstGlobalDoorId === door.globalDoorId
    );
    
    if (hasDependencies) {
      if (!window.confirm('У этой двери есть зависимости. Удалить их тоже?')) {
        return;
      }
      // Удаляем зависимости
      const updatedEdges = (config.edges || []).filter(
        edge => edge.srcGlobalDoorId !== door.globalDoorId && 
                edge.dstGlobalDoorId !== door.globalDoorId
      );
      updateConfig({ edges: updatedEdges });
    }
    
    // Удаляем таймауты
    const updatedTimeouts = (config.postCloseTimeouts || []).filter(
      t => t.globalDoorId !== door.globalDoorId
    );
    
    // Удаляем дверь
    const updatedDoors = doors.filter(
      d => !(d.nodeId === door.nodeId && d.localDoor === door.localDoor)
    );
    
    updateConfig({ 
      doors: updatedDoors,
      postCloseTimeouts: updatedTimeouts,
    });
  };
  
  // Получение уникальных nodeId для фильтра
  const availableNodeIds = useMemo(() => {
    const nodeIds = new Set(doors.map(d => d.nodeId));
    return Array.from(nodeIds).sort((a, b) => a - b);
  }, [doors]);
  
  return (
    <div className="doors-tab">
      <div className="doors-tab-header">
        <h2>Двери ({filteredDoors.length} из {doors.length})</h2>
        <div className="doors-tab-controls">
          <select
            value={filterNodeId}
            onChange={(e) => setFilterNodeId(e.target.value)}
            className="filter-select"
            disabled={loading}
          >
            <option value="all">Все платы</option>
            {availableNodeIds.map(nodeId => (
              <option key={nodeId} value={nodeId}>
                Плата {nodeId}
              </option>
            ))}
          </select>
          <Button onClick={handleAddDoor} variant="primary" disabled={loading}>
            + Добавить дверь
          </Button>
        </div>
      </div>
      
      {filteredDoors.length === 0 ? (
        <div className="empty-state">
          <p>Нет дверей. Нажмите "Добавить дверь" для создания.</p>
        </div>
      ) : (
        <div className="doors-table-container">
          <table className="doors-config-table">
            <thead>
              <tr>
                <th>Плата</th>
                <th>Дверь</th>
                <th>Global ID</th>
                <th>Tech ID</th>
                <th>Drawing ID</th>
                <th>Тип</th>
                <th>Комментарий</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredDoors.map((door, index) => (
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
      
      {/* Модальное окно редактирования двери */}
      {editingDoor && (
        <DoorEditModal
          door={editingDoor}
          existingDoors={doors.filter(d => d.techId !== editingDoor.techId)}
          onSave={handleSaveDoor}
          onCancel={() => setEditingDoor(null)}
        />
      )}
    </div>
  );
};

export default DoorsTab;
