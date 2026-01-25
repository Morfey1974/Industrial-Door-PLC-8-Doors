/**
 * GeneralTab - вкладка общих параметров конфигурации
 * Таймаут открытия: отображается и вводится в секундах, хранится в мс.
 */

import { useState, useEffect } from 'react';

const GeneralTab = ({ config, updateConfig, loading }) => {
  const [localConfig, setLocalConfig] = useState({
    projectName: '',
    openTimeoutSec: 30,
  });

  const msToSec = (ms) => (ms == null ? 30 : Math.round(Number(ms) / 1000));
  const secToMs = (s) => {
    const v = parseInt(String(s), 10);
    if (Number.isNaN(v)) return 30000;
    return Math.max(1000, Math.min(3600000, v * 1000));
  };

  useEffect(() => {
    setLocalConfig({
      projectName: config.projectName || '',
      openTimeoutSec: msToSec(config.openTimeoutMs),
    });
  }, [config]);

  const handleChange = (field, value) => {
    const updated = { ...localConfig, [field]: value };
    setLocalConfig(updated);
    updateConfig({
      projectName: updated.projectName,
      openTimeoutMs: field === 'openTimeoutSec' ? secToMs(updated.openTimeoutSec) : secToMs(localConfig.openTimeoutSec),
    });
  };

  return (
    <div className="general-tab">
      <h2>Общие параметры</h2>

      <div className="form-group">
        <label htmlFor="projectName">
          Короткий заголовок-описание проекта <span className="required">*</span>
        </label>
        <input
          id="projectName"
          type="text"
          value={localConfig.projectName}
          onChange={(e) => handleChange('projectName', e.target.value)}
          placeholder="Введите название проекта"
          maxLength={32}
          disabled={loading}
          className="form-input project-name-input"
        />
        <small>Максимум 32 символа</small>
      </div>

      <div className="form-group">
        <label htmlFor="openTimeoutSec">
          Таймаут, когда дверь долго открыта (с) <span className="required">*</span>
        </label>
        <input
          id="openTimeoutSec"
          type="number"
          value={localConfig.openTimeoutSec}
          onChange={(e) => handleChange('openTimeoutSec', e.target.value)}
          min={1}
          max={3600}
          step={1}
          disabled={loading}
          className="form-input"
        />
        <small>От 1 до 3600 с (1 час). По умолчанию 30 с. Применяется ко всем дверям.</small>
      </div>
      
      <div className="config-info">
        <h3>Информация о конфигурации</h3>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Версия формата:</span>
            <span className="info-value">0x{config.formatVersion?.toString(16).toUpperCase() || '00010001'}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Последовательный номер:</span>
            <span className="info-value">{config.seq || 0}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Количество дверей:</span>
            <span className="info-value">{config.doors?.length || 0}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Количество зависимостей:</span>
            <span className="info-value">{config.edges?.length || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralTab;
