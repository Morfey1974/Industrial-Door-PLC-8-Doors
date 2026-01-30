/**
 * Dashboard страница - главная страница
 * Статусы Сеть, Link, IP, время и ошибка связи отображаются в шапке на всех страницах
 */

import useAutoRefresh from '../hooks/useAutoRefresh';
import { useDoorsData } from '../context/DoorsDataContext';
import DoorsOverview from '../components/ui/DoorsOverview';

const Dashboard = () => {
  const { data: doors, loading: doorsLoading, error: doorsError, refetch: refetchDoors } = useDoorsData();

  useAutoRefresh(() => refetchDoors(true), 5000);

  return (
    <div className="dashboard dashboard-page">
      <div className="page-header">
        <h1>Главная страница</h1>
        <p>Краткий обзор состояния дверей по платам</p>
      </div>

      <section className="dashboard-section doors-table-section">
        {!doorsLoading && !doorsError && doors && doors.doors && (
          <div className="doors-info">
            <p>Всего дверей: <strong>{doors.doors.length}</strong></p>
          </div>
        )}
        {doorsLoading && <p className="loading-inline">Загрузка...</p>}
        {doorsError && (
          <div className="error">
            <p>Ошибка загрузки дверей: {doorsError}</p>
          </div>
        )}
        {!doorsLoading && !doorsError && doors && <DoorsOverview doors={doors} />}
        {!doorsLoading && !doorsError && !doors && <p>Нет данных о дверях</p>}
      </section>
    </div>
  );
};

export default Dashboard;
