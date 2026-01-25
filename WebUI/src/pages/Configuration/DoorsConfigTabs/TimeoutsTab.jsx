/**
 * TimeoutsTab - вкладка настройки индивидуальных таймаутов post-close
 * Таймауты отображаются и вводятся в секундах, в конфиге хранятся в мс.
 * По умолчанию post-close: 0 с.
 */

import { useState, useEffect, useMemo } from 'react';
import Button from '../../../components/common/Button';

const msToSec = (ms) => (ms == null || ms === 0 ? 0 : Math.round(Number(ms) / 1000));
const secToMs = (s) => Math.max(0, Math.min(3600000, (parseInt(String(s), 10) || 0) * 1000));

const TimeoutsTab = ({ config, updateConfig, loading }) => {
  const [timeoutsSec, setTimeoutsSec] = useState({});

  const doors = config.doors || [];
  const postCloseTimeouts = config.postCloseTimeouts || [];

  useEffect(() => {
    const map = {};
    postCloseTimeouts.forEach((t) => {
      map[t.globalDoorId] = msToSec(t.timeoutMs);
    });
    setTimeoutsSec(map);
  }, [postCloseTimeouts]);

  const handleTimeoutChange = (globalDoorId, secValue) => {
    const sec = parseInt(String(secValue), 10) || 0;
    const updated = { ...timeoutsSec, [globalDoorId]: Math.max(0, Math.min(3600, sec)) };
    setTimeoutsSec(updated);

    const updatedPostCloseTimeouts = doors.map((door) => ({
      globalDoorId: door.globalDoorId,
      timeoutMs: secToMs(updated[door.globalDoorId]),
    }));
    updateConfig({ postCloseTimeouts: updatedPostCloseTimeouts });
  };

  const handleResetTimeout = (globalDoorId) => {
    handleTimeoutChange(globalDoorId, 0);
  };

  const handleResetAll = () => {
    if (!window.confirm('Сбросить все индивидуальные таймауты?')) return;
    const reset = {};
    doors.forEach((d) => { reset[d.globalDoorId] = 0; });
    setTimeoutsSec(reset);
    updateConfig({
      postCloseTimeouts: doors.map((d) => ({ globalDoorId: d.globalDoorId, timeoutMs: 0 })),
    });
  };

  const doorsByNode = useMemo(() => {
    const grouped = {};
    doors.forEach((d) => {
      if (!grouped[d.nodeId]) grouped[d.nodeId] = [];
      grouped[d.nodeId].push(d);
    });
    return grouped;
  }, [doors]);

  const openTimeoutSec = msToSec(config.openTimeoutMs);

  return (
    <div className="timeouts-tab">
      <div className="timeouts-tab-header">
        <h2>Индивидуальные таймауты post-close</h2>
        <div className="timeouts-tab-info">
          <p>
            Таймаут, когда дверь долго открыта: <strong>{openTimeoutSec} с</strong> (по умолчанию 30 с).
          </p>
          <p>
            Установите индивидуальные таймауты post-close для каждой двери (с). По умолчанию 0 с.
          </p>
        </div>
        <Button onClick={handleResetAll} variant="secondary" disabled={loading}>
          Сбросить все
        </Button>
      </div>

      {doors.length === 0 ? (
        <div className="empty-state">
          <p>Нет дверей. Добавьте двери на вкладке «Двери».</p>
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
                      <th>Таймаут post-close (с)</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodeDoors.map((door) => (
                      <tr key={door.globalDoorId}>
                        <td>ID-{door.nodeId}-{door.localDoor}</td>
                        <td>{door.globalDoorId}</td>
                        <td>{door.comment || '-'}</td>
                        <td>
                          <input
                            type="number"
                            value={timeoutsSec[door.globalDoorId] ?? 0}
                            onChange={(e) => handleTimeoutChange(door.globalDoorId, e.target.value)}
                            min={0}
                            max={3600}
                            step={1}
                            className="timeout-input"
                            disabled={loading}
                          />
                        </td>
                        <td>
                          <Button
                            onClick={() => handleResetTimeout(door.globalDoorId)}
                            variant="secondary"
                            size="small"
                            disabled={(timeoutsSec[door.globalDoorId] ?? 0) === 0}
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
