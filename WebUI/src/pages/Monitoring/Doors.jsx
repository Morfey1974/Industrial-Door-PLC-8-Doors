/**
 * Мониторинг дверей — обзор по платам, краткая сводка по журналу и дверям, таблица.
 */

import { useState, useCallback } from 'react';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import useApi from '../../hooks/useApi';
import { useDoorsData } from '../../context/DoorsDataContext';
import { useLanguage } from '../../context/LanguageContext';
import DoorTable from '../../components/ui/DoorTable';
import DoorsOverview from '../../components/ui/DoorsOverview';
import FilterBar from '../../components/ui/FilterBar';
import Button from '../../components/common/Button';
import { mapApiErrorToUiMessage } from '../../utils/apiErrorI18n';
import { getJournalStat } from '../../services/api';
import './Monitoring.css';

const Doors = () => {
  const { t } = useLanguage();
  const [filters, setFilters] = useState({
    status: 'all',
    doorId: '',
  });

  const { data: doors, loading, error, refetch } = useDoorsData();
  const errorText = mapApiErrorToUiMessage(error, t);

  const fetchJournalStat = useCallback((signal) => getJournalStat(signal), []);
  const {
    data: journalStat,
    loading: journalLoading,
    error: journalError,
    refetch: refetchJournal,
  } = useApi(fetchJournalStat, []);

  useAutoRefresh(() => {
    refetch(true);
  }, 2500);

  /* Журнал: реже, чем двери — на МК подсчёт totalRecords тяжёлый */
  useAutoRefresh(() => refetchJournal(true), 8000);

  const totalDoors = doors?.doors?.length ?? 0;
  const alarmingCount = doors?.doors?.filter((d) => d.alarming)?.length ?? 0;

  return (
    <div className="monitoring-doors dashboard-page">
      <div className="page-header">
        <h1>{t('pages.doors.title')}</h1>
        <p>{t('pages.doors.subtitleMonitoring')}</p>
      </div>

      {(journalStat || journalLoading || journalError) && (
        <div className="stats-grid" style={{ marginBottom: 'var(--spacing-lg, 24px)' }}>
          <div className="stats-card">
            <h2>{t('pages.statistics.journal')}</h2>
            {journalLoading && !journalStat ? (
              <p className="stats-muted">{t('common.loading')}</p>
            ) : journalStat ? (
              <>
                <p className="stats-value">{journalStat.recordsWritten ?? 0}</p>
                <p className="stats-label">{t('pages.statistics.recordsWritten')}</p>
                <ul className="stats-list">
                  <li>
                    {t('pages.statistics.bufferSize')}: {(journalStat.size ?? 0).toLocaleString()} {t('pages.statistics.bytes')}
                  </li>
                  <li>
                    {t('pages.statistics.sector')}: {journalStat.currentSector ?? 0} {t('pages.statistics.of')} {journalStat.sectors ?? 0}
                  </li>
                  <li>
                    {t('pages.statistics.currentSequence')}: {journalStat.currentSeq ?? 0}
                  </li>
                  {journalStat.droppedQueue !== undefined && journalStat.droppedQueue > 0 && (
                    <li className="stats-warning">
                      {t('pages.statistics.droppedQueue')}: {journalStat.droppedQueue}
                    </li>
                  )}
                  {journalStat.ioErrors !== undefined && journalStat.ioErrors > 0 && (
                    <li className="stats-warning">
                      {t('pages.statistics.ioErrors')}: {journalStat.ioErrors}
                    </li>
                  )}
                </ul>
              </>
            ) : (
              <p className="stats-muted">{mapApiErrorToUiMessage(journalError, t) || t('pages.statistics.errorLoad')}</p>
            )}
          </div>
          <div className="stats-card">
            <h2>{t('pages.statistics.doors')}</h2>
            {!loading && doors?.doors ? (
              <>
                <p className="stats-value">{totalDoors}</p>
                <p className="stats-label">{t('pages.statistics.totalDoors')}</p>
                <ul className="stats-list">
                  <li>
                    {t('pages.statistics.withAlarm')}: <strong>{alarmingCount}</strong>
                  </li>
                  <li>
                    {t('pages.statistics.normal')}: <strong>{totalDoors - alarmingCount}</strong>
                  </li>
                </ul>
              </>
            ) : (
              <p className="stats-muted">{loading ? t('common.loading') : t('pages.doors.noData')}</p>
            )}
          </div>
        </div>
      )}

      {!loading && !error && doors && doors.doors && doors.doors.length > 0 && (
        <section className="doors-overview-section" style={{ marginBottom: 'var(--spacing-lg, 24px)' }}>
          <DoorsOverview doors={doors} />
        </section>
      )}

      <div className="filters-section">
        <div className="filters-row">
          <FilterBar filters={filters} onFilterChange={setFilters} />
          {!loading && !error && doors && doors.doors && (
            <div className="doors-info-inline">
              <span className="doors-info-text">
                {t('pages.dashboard.totalDoors')}: <strong>{doors.doors.length}</strong>
              </span>
              <Button variant="secondary" size="small" onClick={() => refetch(false)}>
                {t('pages.doors.refresh')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {loading && !doors && (
        <div className="doors-table-section door-table-skeleton" aria-busy="true">
          <div className="door-table" style={{ padding: '1rem' }}>
            <p style={{ margin: '0 0 0.75rem 0', color: 'var(--color-text-dark)' }}>{t('pages.doors.loadingDoors')}</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['ID', t('pages.doors.colStatus'), t('pages.doors.colPhysClosed'), t('pages.doors.colLock'), 'Alarm', t('pages.doors.colOpenSeconds')].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <tr key={i}>
                    {[1, 2, 3, 4, 5, 6].map((j) => (
                      <td key={j} style={{ padding: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>
                        <span className="door-skeleton-bar" style={{ display: 'inline-block', height: 14, borderRadius: 4, background: 'var(--color-border)', width: j === 1 ? 32 : j === 2 ? 72 : 56, opacity: 0.7 }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem', opacity: 0.7 }}>
              {t('pages.doors.loadingHint')}
            </p>
          </div>
        </div>
      )}

      {error && !doors && (
        <div className="error-state">
          <h3>{t('pages.doors.errorLoad')}</h3>
          <p>{errorText}</p>
          <p>{t('pages.doors.errorCheckController')}</p>
          <Button variant="primary" onClick={() => refetch(false)}>
            {t('common.retryAgain')}
          </Button>
        </div>
      )}

      {doors && (
        <div className="doors-table-section">
          <DoorTable doors={doors} filters={filters} />
          {error && doors && (
            <div className="warning-state" style={{ marginTop: '1rem', padding: '0.5rem', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>
                ⚠️ {t('pages.doors.autoRefreshError').replace('{error}', String(errorText))}
              </p>
            </div>
          )}
        </div>
      )}

      {!loading && !error && (!doors || !doors.doors || doors.doors.length === 0) && (
        <div className="no-data-state">
          <p>{t('pages.doors.noData')}</p>
        </div>
      )}
    </div>
  );
};

export default Doors;
