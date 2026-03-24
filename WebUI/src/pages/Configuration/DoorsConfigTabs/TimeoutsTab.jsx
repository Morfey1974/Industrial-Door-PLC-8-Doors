/**
 * TimeoutsTab - вкладка настройки индивидуальных таймаутов post-close
 * Таймауты отображаются и вводятся в секундах, в конфиге хранятся в мс.
 * По умолчанию post-close: 0 с.
 */

import { useState, useEffect, useMemo } from 'react';
import Button from '../../../components/common/Button';
import { useLanguage } from '../../../context/LanguageContext';

const msToSec = (ms) => (ms == null || ms === 0 ? 0 : Math.round(Number(ms) / 1000));
const secToMs = (s) => Math.max(0, Math.min(3600000, (parseInt(String(s), 10) || 0) * 1000));

const TimeoutsTab = ({ config, updateConfig, loading, showConfirm }) => {
  const { t } = useLanguage();
  const [timeoutsSec, setTimeoutsSec] = useState({});

  const doors = config.doors || [];
  const postCloseTimeouts = config.postCloseTimeouts || [];

  useEffect(() => {
    const map = {};
    postCloseTimeouts.forEach((item) => {
      map[item.globalDoorId] = msToSec(item.timeoutMs);
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

  const handleResetAll = async () => {
    if (!showConfirm) {
      if (!window.confirm(t('pages.config.timeoutsResetAsk'))) return;
    } else {
      const confirmed = await showConfirm(
        t('pages.config.timeoutsResetAsk'),
        t('pages.config.timeoutsResetTitle')
      );
      if (!confirmed) return;
    }
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
        <h2>{t('pages.timeoutsTab.postCloseTitle')}</h2>
        <div className="timeouts-tab-info">
          <p>
            {t('pages.timeoutsTab.introOpen', { sec: String(openTimeoutSec) })}
          </p>
          <p>
            {t('pages.timeoutsTab.introPostClose')}
          </p>
        </div>
        <Button onClick={handleResetAll} variant="secondary" disabled={loading}>
          {t('pages.timeoutsTab.resetAll')}
        </Button>
      </div>

      {doors.length === 0 ? (
        <div className="empty-state">
          <p>{t('pages.timeoutsTab.noDoors')}</p>
        </div>
      ) : (
        <div className="timeouts-content">
          {Object.entries(doorsByNode).map(([nodeId, nodeDoors]) => (
            <div key={nodeId} className="timeouts-node-group">
              <h3>{t('pages.timeoutsTab.board')} {nodeId}</h3>
              <div className="timeouts-table-container">
                <table className="timeouts-table">
                  <thead>
                    <tr>
                      <th>{t('pages.timeoutsTab.colDoor')}</th>
                      <th>{t('pages.timeoutsTab.colGlobalId')}</th>
                      <th>{t('pages.timeoutsTab.colComment')}</th>
                      <th>{t('pages.timeoutsTab.colPostClose')}</th>
                      <th>{t('pages.timeoutsTab.actions')}</th>
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
                            {t('pages.timeoutsTab.reset')}
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
