/**
 * GeneralTab - вкладка общих параметров конфигурации
 */

import { useState, useEffect } from 'react';

const GeneralTab = ({ config, updateConfig, loading }) => {
  const [localConfig, setLocalConfig] = useState({
    projectName: '',
    openTimeoutMs: 30000,
  });
  
  // Синхронизация с родительским состоянием
  useEffect(() => {
    setLocalConfig({
      projectName: config.projectName || '',
      openTimeoutMs: config.openTimeoutMs || 30000,
    });
  }, [config]);
  
  // Обновление локального состояния
  const handleChange = (field, value) => {
    const updated = { ...localConfig, [field]: value };
    setLocalConfig(updated);
    
    // Обновляем родительскую конфигурацию
    updateConfig({
      projectName: updated.projectName,
      openTimeoutMs: parseInt(updated.openTimeoutMs, 10),
    });
  };
  
  return (
    <div className="general-tab">
      <h2>Общие параметры</h2>
      
      <div className="form-group">
        <label htmlFor="projectName">
          Название проекта <span className="required">*</span>
        </label>
        <input
          id="projectName"
          type="text"
          value={localConfig.projectName}
          onChange={(e) => handleChange('projectName', e.target.value)}
          placeholder="Введите название проекта"
          maxLength={32}
          disabled={loading}
          className="form-input"
        />
        <small>Максимум 32 символа</small>
      </div>
      
      <div className="form-group">
        <label htmlFor="openTimeoutMs">
          Глобальный таймаут открытия (мс) <span className="required">*</span>
        </label>
        <input
          id="openTimeoutMs"
          type="number"
          value={localConfig.openTimeoutMs}
          onChange={(e) => handleChange('openTimeoutMs', e.target.value)}
          min={1000}
          max={3600000}
          step={1000}
          disabled={loading}
          className="form-input"
        />
        <small>От 1000 до 3600000 мс (1 час). Применяется ко всем дверям.</small>
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
