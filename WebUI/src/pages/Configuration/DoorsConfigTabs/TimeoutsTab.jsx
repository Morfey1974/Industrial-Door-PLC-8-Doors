/**
 * TimeoutsTab - вкладка настройки индивидуальных таймаутов post-close
 */

import { useState, useEffect, useMemo } from 'react';
import Button from '../../../components/common/Button';

const TimeoutsTab = ({ config, updateConfig, loading }) => {
  const [timeouts, setTimeouts] = useState({});
  
  const doors = config.doors || [];
  const postCloseTimeouts = config.postCloseTimeouts || [];
  
  // Инициализация таймаутов из конфигурации
  useEffect(() => {
    const timeoutsMap = {};
    postCloseTimeouts.forEach(t => {
      timeoutsMap[t.globalDoorId] = t.timeoutMs || 0;
    });
    setTimeouts(timeoutsMap);
  }, [postCloseTimeouts]);
  
  // Обновление таймаута для двери
  const handleTimeoutChange = (globalDoorId, timeoutMs) => {
    const updatedTimeouts = { ...timeouts, [globalDoorId]: parseInt(timeoutMs, 10) || 0 };
    setTimeouts(updatedTimeouts);
    
    // Обновляем конфигурацию
    const updatedPostCloseTimeouts = doors.map(door => ({
      globalDoorId: door.globalDoorId,
      timeoutMs: updatedTimeouts[door.globalDoorId] || 0,
    }));
    
    updateConfig({ postCloseTimeouts: updatedPostCloseTimeouts });
  };
  
  // Сброс таймаута для двери
  const handleResetTimeout = (globalDoorId) => {
    handleTimeoutChange(globalDoorId, 0);
  };
  
  // Массовый сброс всех таймаутов
  const handleResetAll = () => {
    if (!window.confirm('Сбросить все индивидуальные таймауты?')) {
      return;
    }
    
    const resetTimeouts = {};
    doors.forEach(door => {
      resetTimeouts[door.globalDoorId] = 0;
    });
    setTimeouts(resetTimeouts);
    
    const updatedPostCloseTimeouts = doors.map(door => ({
      globalDoorId: door.globalDoorId,
      timeoutMs: 0,
    }));
    
    updateConfig({ postCloseTimeouts: updatedPostCloseTimeouts });
  };
  
  // Группировка дверей по плате
  const doorsByNode = useMemo(() => {
    const grouped = {};
    doors.forEach(door => {
      if (!grouped[door.nodeId]) {
        grouped[door.nodeId] = [];
      }
      grouped[door.nodeId].push(door);
    });
    return grouped;
  }, [doors]);
  
  return (
    <div className="timeouts-tab">
      <div className="timeouts-tab-header">
        <h2>Индивидуальные таймауты post-close</h2>
        <div className="timeouts-tab-info">
          <p>
            Глобальный таймаут открытия: <strong>{config.openTimeoutMs || 30000} мс</strong>
          </p>
          <p>
            Установите индивидуальные таймауты post-close для каждой двери. 
            Если не установлено (0), используется значение по умолчанию.
          </p>
        </div>
        <Button onClick={handleResetAll} variant="secondary" disabled={loading}>
          Сбросить все
        </Button>
      </div>
      
      {doors.length === 0 ? (
        <div className="empty-state">
          <p>Нет дверей. Добавьте двери на вкладке "Двери".</p>
        </div>
      ) : (
        <div className="timeouts-content">
          {Object.entries(doorsByNode).map(([nodeId, nodeDoors]) => (
            <div key={nodeId} className="timeouts-node-group">
              <h3>Плата {nodeId}</h3>
              <div className="timeouts-table-container">
                <table className="timeouts-table">
                  <thead>
                    <tr>
                      <th>Дверь</th>
                      <th>Global ID</th>
                      <th>Комментарий</th>
                      <th>Таймаут post-close (мс)</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodeDoors.map(door => (
                      <tr key={door.globalDoorId}>
                        <td>ID-{door.nodeId}-{door.localDoor}</td>
                        <td>{door.globalDoorId}</td>
                        <td>{door.comment || '-'}</td>
                        <td>
                          <input
                            type="number"
                            value={timeouts[door.globalDoorId] || 0}
                            onChange={(e) => handleTimeoutChange(door.globalDoorId, e.target.value)}
                            min={0}
                            max={3600000}
                            step={1000}
                            className="timeout-input"
                            disabled={loading}
                          />
                        </td>
                        <td>
                          <Button
                            onClick={() => handleResetTimeout(door.globalDoorId)}
                            variant="secondary"
                            size="small"
                            disabled={!timeouts[door.globalDoorId]}
                          >
                            Сбросить
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TimeoutsTab;
