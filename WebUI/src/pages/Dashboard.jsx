/**
 * Dashboard страница - главная страница
 * Статусы Сеть, Link, IP, время и ошибка связи отображаются в шапке на всех страницах
 */

import useAutoRefresh from '../hooks/useAutoRefresh';
import { useDoorsData } from '../context/DoorsDataContext';
import { useLanguage } from '../context/LanguageContext';
import DoorsOverview from '../components/ui/DoorsOverview';

const Dashboard = () => {
  const { t } = useLanguage();
  const { data: doors, loading: doorsLoading, error: doorsError, refetch: refetchDoors } = useDoorsData();

  useAutoRefresh(() => refetchDoors(true), 2500);

  return (
    <div className="dashboard dashboard-page">
      <div className="page-header">
        <h1>{t('pages.dashboard.title')}</h1>
        <p>{t('pages.dashboard.subtitle')}</p>
      </div>

      <section className="dashboard-section doors-table-section">
        {!doorsLoading && !doorsError && doors && doors.doors && (
          <div className="doors-info">
            <p>{t('pages.dashboard.totalDoors')}: <strong>{doors.doors.length}</strong></p>
          </div>
        )}
        {doorsLoading && <p className="loading-inline">{t('common.loading')}</p>}
        {doorsError && (
          <div className="error">
            <p>{t('pages.dashboard.errorDoors')}: {doorsError}</p>
          </div>
        )}
        {!doorsLoading && !doorsError && doors && <DoorsOverview doors={doors} />}
        {!doorsLoading && !doorsError && !doors && <p>{t('pages.dashboard.noData')}</p>}
      </section>
    </div>
  );
};

export default Dashboard;
