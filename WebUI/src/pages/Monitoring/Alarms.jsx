/**
 * Alarms страница — таблица дверей с активными авариями (alarming == 1)
 * По плану: фильтр по alarming == 1 из /api/doors, отображение причин аварии (alarmReasons)
 */

import { useState } from 'react';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import { useDoorsData } from '../../context/DoorsDataContext';
import { useLanguage } from '../../context/LanguageContext';
import DoorTable from '../../components/ui/DoorTable';
import Button from '../../components/common/Button';
import './Monitoring.css';

const Alarms = () => {
  const { t } = useLanguage();
  const { data: doors, loading, error, refetch } = useDoorsData();

  useAutoRefresh(() => refetch(true), 2000);

  const alarmingDoors = doors?.doors?.filter((d) => d.alarming) ?? [];
  const hasAlarms = alarmingDoors.length > 0;

  return (
    <div className="monitoring-alarms">
      <div className="page-header">
        <h1>{t('pages.alarms.title')}</h1>
        <p>{t('pages.alarms.subtitle')}</p>
      </div>

      {!loading && !error && doors && (
        <div className="alarms-info alarms-info-row">
          <span className="alarms-info-text">
            Дверей с аварией: <strong>{alarmingDoors.length}</strong>
            {doors.doors?.length > 0 && (
              <span className="alarms-info-total"> из {doors.doors.length} всего</span>
            )}
          </span>
          <Button variant="secondary" size="small" onClick={() => refetch(false)}>
            {t('common.refresh')}
          </Button>
        </div>
      )}

      {loading && !doors && (
        <div className="loading-state">
          <p>Загрузка данных о дверях…</p>
        </div>
      )}

      {error && !doors && (
        <div className="error-state">
          <h3>{t('pages.alarms.errorLoad')}</h3>
          <p>{error}</p>
          <Button variant="primary" onClick={() => refetch(false)}>
            {t('common.retryAgain')}
          </Button>
        </div>
      )}

      {doors && (
        <div className="alarms-table-section">
          {hasAlarms ? (
            <DoorTable doors={{ doors: alarmingDoors }} filters={{ status: 'alarm' }} />
          ) : (
            <div className="no-data-state">
              <p>Нет активных аварий</p>
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', opacity: 0.8 }}>
                Все двери в норме. При появлении аварии (например, дверь открыта слишком долго) запись появится здесь.
              </p>
            </div>
          )}
        </div>
      )}

      {!loading && !error && (!doors || !doors.doors || doors.doors.length === 0) && (
        <div className="no-data-state">
          <p>Нет данных о дверях</p>
        </div>
      )}
    </div>
  );
};

export default Alarms;
