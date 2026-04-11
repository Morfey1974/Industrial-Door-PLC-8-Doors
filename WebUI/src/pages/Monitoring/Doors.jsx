/**
 * Мониторинг дверей — обзор по платам и таблица с фильтрами.
 */

import { useState, useEffect, useCallback } from 'react';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import { useDoorsData } from '../../context/DoorsDataContext';
import { useLanguage } from '../../context/LanguageContext';
import DoorTable from '../../components/ui/DoorTable';
import DoorsOverview from '../../components/ui/DoorsOverview';
import FilterBar from '../../components/ui/FilterBar';
import Button from '../../components/common/Button';
import { mapApiErrorToUiMessage } from '../../utils/apiErrorI18n';
import { DOORS_MONITOR_REFRESH_MS } from '../../utils/constants';
import './Monitoring.css';

const Doors = () => {
  const { t, language } = useLanguage();
  const [filters, setFilters] = useState({
    status: 'all',
    doorId: '',
  });
  const [actionBanner, setActionBanner] = useState(null);

  const { data: doors, loading, error, refetch } = useDoorsData();

  useEffect(() => {
    if (actionBanner == null) return undefined;
    const id = setTimeout(() => setActionBanner(null), 5000);
    return () => clearTimeout(id);
  }, [actionBanner]);

  const handleManualRefresh = useCallback(async () => {
    setActionBanner(null);
    const ok = await refetch(false, true);
    if (ok) {
      setActionBanner({ text: t('common.refreshDataSuccess'), variant: 'success' });
    } else {
      setActionBanner({ text: t('common.refreshDataFailed'), variant: 'error' });
    }
  }, [refetch, t]);
  const errorText = mapApiErrorToUiMessage(error, t);

  useAutoRefresh(() => {
    refetch(true);
  }, DOORS_MONITOR_REFRESH_MS);

  const doorList = doors?.doors;
  const countForTitle = Array.isArray(doorList) ? doorList.length : null;

  const doorsWordForTitle = (n) => {
    if (language === 'en') {
      return n === 1 ? t('pages.doors.titleDoorsWordOne') : t('pages.doors.titleDoorsWordOther');
    }
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 14) return t('pages.doors.titleDoorsWordMany');
    if (mod10 === 1) return t('pages.doors.titleDoorsWordOne');
    if (mod10 >= 2 && mod10 <= 4) return t('pages.doors.titleDoorsWordFew');
    return t('pages.doors.titleDoorsWordMany');
  };

  const pageTitle =
    countForTitle !== null
      ? t('pages.doors.titleWithCount', { count: countForTitle, doorsWord: doorsWordForTitle(countForTitle) })
      : t('pages.doors.title');

  return (
    <div className="monitoring-doors dashboard-page">
      <div className="page-header">
        <h1>{pageTitle}</h1>
      </div>

      <div className="doors-page-messages">
        {error && !doors && (
          <div className="error-state">
            <h3>{t('pages.doors.errorLoad')}</h3>
            <p>{errorText}</p>
            <p>{t('pages.doors.errorCheckController')}</p>
            <Button variant="primary" onClick={() => refetch(false, true)}>
              {t('common.retryAgain')}
            </Button>
          </div>
        )}
        {error && doors && (
          <div
            className="warning-state doors-page-warning"
            role="alert"
          >
            <p style={{ margin: 0, fontSize: '0.875rem' }}>
              ⚠️ {t('pages.doors.autoRefreshError').replace('{error}', String(errorText))}
            </p>
          </div>
        )}
      </div>

      <div className="filters-section">
        <div className="filters-row">
          <FilterBar filters={filters} onFilterChange={setFilters} />
          {doors && Array.isArray(doors.doors) && (
            <div className="doors-info-inline">
              <Button
                variant="secondary"
                size="small"
                onClick={handleManualRefresh}
                disabled={loading}
              >
                {t('pages.doors.refresh')}
              </Button>
            </div>
          )}
        </div>
        {actionBanner && (
          <div
            className={`events-action-banner events-action-banner--${actionBanner.variant}`}
            role="status"
          >
            {actionBanner.variant === 'success' ? (
              <>✅ {actionBanner.text}</>
            ) : (
              actionBanner.text
            )}
          </div>
        )}
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

      {!loading && !error && doors && doors.doors && doors.doors.length > 0 && (
        <section className="doors-overview-section" style={{ marginBottom: 'var(--spacing-lg, 24px)' }}>
          <DoorsOverview doors={doors} />
        </section>
      )}

      {doors && doors.doors && doors.doors.length > 0 && (
        <div className="doors-table-section">
          <DoorTable doors={doors} filters={filters} />
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
