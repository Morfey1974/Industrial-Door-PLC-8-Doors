/**
 * DependenciesTab - вкладка настройки зависимостей между дверями
 * 
 * Реализует:
 * - Выбор двери-источника
 * - Выбор дверей-целей (блокируемых)
 * - Список всех зависимостей
 * - Редактирование и удаление зависимостей
 */

import { useState, useEffect, useMemo } from 'react';
import Button from '../../../components/common/Button';

const DependenciesTab = ({ config, updateConfig, loading }) => {
  const [selectedSrcDoor, setSelectedSrcDoor] = useState(null);
  const [selectedDstDoors, setSelectedDstDoors] = useState([]);
  
  const doors = config.doors || [];
  const edges = config.edges || [];
  
  // Получаем список дверей для выбора
  const doorOptions = useMemo(() => {
    return doors.map(door => ({
      value: door.globalDoorId,
      label: `ID-${door.nodeId}-${door.localDoor} (${door.comment || 'без комментария'})`,
      door,
    }));
  }, [doors]);
  
  // Получаем зависимости для выбранной двери-источника
  const dependenciesForSrc = useMemo(() => {
    if (!selectedSrcDoor) return [];
    return edges
      .filter(edge => edge.srcGlobalDoorId === selectedSrcDoor)
      .map(edge => edge.dstGlobalDoorId);
  }, [edges, selectedSrcDoor]);
  
  // Инициализация выбранных целей при выборе источника
  useEffect(() => {
    if (selectedSrcDoor) {
      setSelectedDstDoors(dependenciesForSrc);
    } else {
      setSelectedDstDoors([]);
    }
  }, [selectedSrcDoor, dependenciesForSrc]);
  
  // Сохранение зависимости
  const handleSaveDependency = () => {
    if (!selectedSrcDoor) {
      alert('Выберите дверь-источник');
      return;
    }
    
    if (selectedDstDoors.length === 0) {
      alert('Выберите хотя бы одну дверь для блокировки');
      return;
    }
    
    // Удаляем старые зависимости для этой двери-источника
    const updatedEdges = edges.filter(edge => edge.srcGlobalDoorId !== selectedSrcDoor);
    
    // Добавляем новые зависимости
    selectedDstDoors.forEach(dstId => {
      // Проверяем, что дверь не блокирует сама себя
      if (dstId === selectedSrcDoor) {
        alert('Дверь не может блокировать сама себя');
        return;
      }
      updatedEdges.push({
        srcGlobalDoorId: selectedSrcDoor,
        dstGlobalDoorId: dstId,
      });
    });
    
    updateConfig({ edges: updatedEdges });
    setSelectedSrcDoor(null);
    setSelectedDstDoors([]);
  };
  
  // Редактирование зависимости
  const handleEditDependency = (srcGlobalDoorId) => {
    setSelectedSrcDoor(srcGlobalDoorId);
  };
  
  // Удаление зависимости
  const handleDeleteDependency = (srcGlobalDoorId) => {
    if (!window.confirm('Удалить все зависимости для этой двери?')) {
      return;
    }
    
    const updatedEdges = edges.filter(edge => edge.srcGlobalDoorId !== srcGlobalDoorId);
    updateConfig({ edges: updatedEdges });
  };
  
  // Получение информации о двери по globalDoorId
  const getDoorInfo = (globalDoorId) => {
    const door = doors.find(d => d.globalDoorId === globalDoorId);
    if (!door) return `ID-${globalDoorId}`;
    return `ID-${door.nodeId}-${door.localDoor}${door.comment ? ` (${door.comment})` : ''}`;
  };
  
  // Группировка зависимостей по источнику
  const groupedDependencies = useMemo(() => {
    const groups = {};
    edges.forEach(edge => {
      if (!groups[edge.srcGlobalDoorId]) {
        groups[edge.srcGlobalDoorId] = [];
      }
      groups[edge.srcGlobalDoorId].push(edge.dstGlobalDoorId);
    });
    return groups;
  }, [edges]);
  
  return (
    <div className="dependencies-tab">
      <h2>Зависимости между дверями</h2>
      
      {doors.length === 0 ? (
        <div className="empty-state">
          <p>Нет дверей. Добавьте двери на вкладке "Двери" перед настройкой зависимостей.</p>
        </div>
      ) : (
        <>
          <div className="dependencies-editor">
            <div className="dependency-form">
              <h3>Создать/редактировать зависимость</h3>
              
              <div className="form-group">
                <label htmlFor="srcDoor">
                  Когда открывается дверь: <span className="required">*</span>
                </label>
                <select
                  id="srcDoor"
                  value={selectedSrcDoor || ''}
                  onChange={(e) => setSelectedSrcDoor(e.target.value ? parseInt(e.target.value, 10) : null)}
                  className="form-input"
                  disabled={loading}
                >
                  <option value="">-- Выберите дверь --</option>
                  {doorOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
          
          {selectedSrcDoor && (
            <div className="form-group">
              <label>Блокируются двери:</label>
              <div className="door-checkboxes">
                {doorOptions
                  .filter(option => option.value !== selectedSrcDoor)
                  .map(option => (
                    <label key={option.value} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedDstDoors.includes(option.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDstDoors([...selectedDstDoors, option.value]);
                          } else {
                            setSelectedDstDoors(selectedDstDoors.filter(id => id !== option.value));
                          }
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
              </div>
            </div>
          )}
          
          {selectedSrcDoor && (
            <div className="form-actions">
              <Button onClick={handleSaveDependency} variant="primary">
                Сохранить зависимость
              </Button>
              <Button 
                onClick={() => {
                  setSelectedSrcDoor(null);
                  setSelectedDstDoors([]);
                }} 
                variant="secondary"
              >
                Отмена
              </Button>
            </div>
          )}
        </div>
      </div>
      
      <div className="dependencies-list">
        <h3>Список всех зависимостей ({Object.keys(groupedDependencies).length})</h3>
        
        {Object.keys(groupedDependencies).length === 0 ? (
          <div className="empty-state">
            <p>Нет зависимостей. Создайте зависимость выше.</p>
          </div>
        ) : (
          <div className="dependencies-table-container">
            <table className="dependencies-table">
              <thead>
                <tr>
                  <th>Дверь-источник</th>
                  <th>Блокируемые двери</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupedDependencies).map(([srcId, dstIds]) => (
                  <tr key={srcId}>
                    <td>{getDoorInfo(parseInt(srcId, 10))}</td>
                    <td>
                      {dstIds.map((dstId, index) => (
                        <span key={dstId}>
                          {getDoorInfo(dstId)}
                          {index < dstIds.length - 1 && ', '}
                        </span>
                      ))}
                    </td>
                    <td>
                      <Button
                        onClick={() => handleEditDependency(parseInt(srcId, 10))}
                        variant="secondary"
                        size="small"
                      >
                        ✏️
                      </Button>
                      <Button
                        onClick={() => handleDeleteDependency(parseInt(srcId, 10))}
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
      </div>
        </>
      )}
    </div>
  );
};

export default DependenciesTab;
