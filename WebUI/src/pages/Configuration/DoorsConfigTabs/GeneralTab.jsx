/**
 * GeneralTab - вкладка общих параметров конфигурации
 * Таймаут открытия: отображается и вводится в секундах, хранится в мс.
 * «Нет сигнализации» — режим без таймаута (эффективно бесконечный).
 */

import { useState, useEffect } from 'react';
import { useLanguage } from '../../../context/LanguageContext';

const NO_ALARM_MS = 0; // 0 = отключена автосигнализация, только кнопка Alarm

const GeneralTab = ({ config, updateConfig, loading }) => {
  const { t } = useLanguage();
  const [localConfig, setLocalConfig] = useState({
    projectName: '',
    openTimeoutSec: 30,
    noAlarm: false,
  });

  const msToSec = (ms) => (ms == null ? 30 : Math.round(Number(ms) / 1000));
  const secToMs = (s) => {
    const v = parseInt(String(s), 10);
    if (Number.isNaN(v)) return 30000;
    return Math.max(1000, Math.min(3600000, v * 1000));
  };

  useEffect(() => {
    const noAlarm = config.noAlarm === true || config.openTimeoutMs === 0;
    setLocalConfig({
      projectName: config.projectName || '',
      openTimeoutSec: noAlarm ? 30 : msToSec(config.openTimeoutMs),
      noAlarm,
    });
  }, [config]);

  const handleChange = (field, value) => {
    let updated = { ...localConfig, [field]: value };
    let timeoutMs;
    if (updated.noAlarm) {
      timeoutMs = NO_ALARM_MS;
    } else {
      // При снятии галочки — восстанавливаем режим таймаута (30 с по умолчанию)
      if (field === 'noAlarm' && localConfig.noAlarm) {
        updated = { ...updated, openTimeoutSec: 30 };
      }
      timeoutMs = secToMs(updated.openTimeoutSec);
    }
    setLocalConfig(updated);
    updateConfig({
      projectName: updated.projectName,
      openTimeoutMs: timeoutMs,
      noAlarm: updated.noAlarm,
    });
  };

  return (
    <div className="general-tab">
      <h2>{t('pages.generalTab.projectName')}</h2>

      <div className="form-group">
        <label htmlFor="projectName">
          {t('pages.generalTab.projectLabel')}
        </label>
        <input
          id="projectName"
          type="text"
          value={localConfig.projectName}
          onChange={(e) => handleChange('projectName', e.target.value)}
          placeholder={t('pages.generalTab.projectPlaceholder')}
          maxLength={100}
          disabled={loading}
          className="form-input project-name-input"
        />
        <small>{t('pages.generalTab.maxChars')}</small>
      </div>

      <div className="form-group">
        <label htmlFor="openTimeoutSec">
          {t('pages.generalTab.alarmTimeoutSec')}
        </label>
        <div className="timeout-with-checkbox">
          <input
            id="openTimeoutSec"
            type="number"
            value={localConfig.openTimeoutSec}
            onChange={(e) => handleChange('openTimeoutSec', e.target.value)}
            min={1}
            max={3600}
            step={1}
            disabled={loading || localConfig.noAlarm}
            className="form-input timeout-input"
          />
          <label className="no-alarm-checkbox-label">
            <input
              type="checkbox"
              checked={localConfig.noAlarm}
              onChange={(e) => handleChange('noAlarm', e.target.checked)}
              disabled={loading}
            />
            {localConfig.noAlarm
              ? t('pages.generalTab.noAlarmOn')
              : t('pages.generalTab.noAlarmOff')}
          </label>
        </div>
        <small>
          {localConfig.noAlarm
            ? t('pages.generalTab.noAlarmHintOn')
            : t('pages.generalTab.noAlarmHintOff')}
        </small>
      </div>

      <div className="config-info">
        <h3>{t('pages.generalTab.configInfo')}</h3>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">{t('pages.generalTab.formatVersion')}</span>
            <span className="info-value">0x{config.formatVersion?.toString(16).toUpperCase() || '00010001'}</span>
          </div>
          <div className="info-item">
            <span className="info-label">{t('pages.generalTab.configVersion')}</span>
            <span className="info-value">{config.seq || 0}</span>
          </div>
          <div className="info-item">
            <span className="info-label">{t('pages.generalTab.doorsCount')}</span>
            <span className="info-value">{config.doors?.length || 0}</span>
          </div>
          <div className="info-item">
            <span className="info-label">{t('pages.generalTab.edgesCount')}</span>
            <span className="info-value">{config.edges?.length || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralTab;
