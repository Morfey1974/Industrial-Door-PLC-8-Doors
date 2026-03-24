/**
 * DependenciesTab - вкладка настройки зависимостей между дверями
 */

import { useState, useEffect, useMemo } from 'react';
import Button from '../../../components/common/Button';
import { useLanguage } from '../../../context/LanguageContext';

const DependenciesTab = ({ config, updateConfig, loading, showConfirm }) => {
  const { t } = useLanguage();
  const [selectedSrcDoor, setSelectedSrcDoor] = useState(null);
  const [selectedDstDoors, setSelectedDstDoors] = useState([]);

  const doors = config.doors || [];
  const edges = config.edges || [];

  const doorOptions = useMemo(() => {
    return doors.map((door) => ({
      value: door.globalDoorId,
      label: `ID-${door.nodeId}-${door.localDoor} (${door.comment || t('pages.dependenciesTab.noComment')})`,
      door,
    }));
  }, [doors, t]);

  const dependenciesForSrc = useMemo(() => {
    if (!selectedSrcDoor) return [];
    return edges
      .filter((edge) => edge.srcGlobalDoorId === selectedSrcDoor)
      .map((edge) => edge.dstGlobalDoorId);
  }, [edges, selectedSrcDoor]);

  useEffect(() => {
    if (selectedSrcDoor) {
      setSelectedDstDoors(dependenciesForSrc);
    } else {
      setSelectedDstDoors([]);
    }
  }, [selectedSrcDoor, dependenciesForSrc]);

  const handleSaveDependency = () => {
    if (!selectedSrcDoor) {
      alert(t('pages.dependenciesTab.pickSource'));
      return;
    }

    if (selectedDstDoors.length === 0) {
      alert(t('pages.dependenciesTab.pickTarget'));
      return;
    }

    const updatedEdges = edges.filter((edge) => edge.srcGlobalDoorId !== selectedSrcDoor);

    selectedDstDoors.forEach((dstId) => {
      if (dstId === selectedSrcDoor) {
        alert(t('pages.dependenciesTab.selfBlock'));
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

  const handleEditDependency = (srcGlobalDoorId) => {
    setSelectedSrcDoor(srcGlobalDoorId);
  };

  const handleDeleteDependency = async (srcGlobalDoorId) => {
    const ask = t('pages.config.deleteAllDepsAsk');
    if (!showConfirm) {
      if (!window.confirm(ask)) {
        return;
      }
    } else {
      const confirmed = await showConfirm(ask, t('pages.config.deleteDepsTitle'));
      if (!confirmed) {
        return;
      }
    }

    const updatedEdges = edges.filter((edge) => edge.srcGlobalDoorId !== srcGlobalDoorId);
    updateConfig({ edges: updatedEdges });
  };

  const getDoorInfo = (globalDoorId) => {
    const door = doors.find((d) => d.globalDoorId === globalDoorId);
    if (!door) return `ID-${globalDoorId}`;
    return `ID-${door.nodeId}-${door.localDoor}${door.comment ? ` (${door.comment})` : ''}`;
  };

  const groupedDependencies = useMemo(() => {
    const groups = {};
    edges.forEach((edge) => {
      if (!groups[edge.srcGlobalDoorId]) {
        groups[edge.srcGlobalDoorId] = [];
      }
      groups[edge.srcGlobalDoorId].push(edge.dstGlobalDoorId);
    });
    return groups;
  }, [edges]);

  return (
    <div className="dependencies-tab">
      <h2>{t('pages.dependenciesTab.title')}</h2>

      {doors.length === 0 ? (
        <div className="empty-state">
          <p>{t('pages.dependenciesTab.noDoors')}</p>
        </div>
      ) : (
        <>
          <div className="dependencies-editor">
            <div className="dependency-form">
              <h3>{t('pages.dependenciesTab.createEdit')}</h3>

              <div className="form-group">
                <label htmlFor="srcDoor">
                  {t('pages.dependenciesTab.whenOpens')} <span className="required">*</span>
                </label>
                <select
                  id="srcDoor"
                  value={selectedSrcDoor || ''}
                  onChange={(e) => setSelectedSrcDoor(e.target.value ? parseInt(e.target.value, 10) : null)}
                  className="form-input"
                  disabled={loading}
                >
                  <option value="">{t('pages.dependenciesTab.selectDoor')}</option>
                  {doorOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {selectedSrcDoor && (
                <div className="form-group">
                  <label>{t('pages.dependenciesTab.blockedDoors')}</label>
                  <div className="door-checkboxes">
                    {doorOptions
                      .filter((option) => option.value !== selectedSrcDoor)
                      .map((option) => (
                        <label key={option.value} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={selectedDstDoors.includes(option.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDstDoors([...selectedDstDoors, option.value]);
                              } else {
                                setSelectedDstDoors(selectedDstDoors.filter((id) => id !== option.value));
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
                    {t('pages.dependenciesTab.saveDependency')}
                  </Button>
                  <Button
                    onClick={() => {
                      setSelectedSrcDoor(null);
                      setSelectedDstDoors([]);
                    }}
                    variant="secondary"
                  >
                    {t('pages.dependenciesTab.cancel')}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="dependencies-list">
            <h3>
              {t('pages.dependenciesTab.listAll', { count: String(Object.keys(groupedDependencies).length) })}
            </h3>

            {Object.keys(groupedDependencies).length === 0 ? (
              <div className="empty-state">
                <p>{t('pages.dependenciesTab.emptyList')}</p>
              </div>
            ) : (
              <div className="dependencies-table-container">
                <table className="dependencies-table">
                  <thead>
                    <tr>
                      <th>{t('pages.dependenciesTab.colSource')}</th>
                      <th>{t('pages.dependenciesTab.colBlocked')}</th>
                      <th>{t('pages.dependenciesTab.colActions')}</th>
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
