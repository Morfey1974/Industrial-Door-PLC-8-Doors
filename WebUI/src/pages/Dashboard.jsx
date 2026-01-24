/**
 * Dashboard страница - главная страница
 */

import useApi from '../hooks/useApi';
import useAutoRefresh from '../hooks/useAutoRefresh';
import { getState, getDoors } from '../services/api';
import StatusCard from '../components/common/StatusCard';
import DoorsOverview from '../components/ui/DoorsOverview';
import { formatUptime, formatIpAddress } from '../utils/formatters';

const Dashboard = () => {
  // Получаем состояние системы
  const { data: state, loading: stateLoading, error: stateError, refetch: refetchState } = useApi(getState);
  
  // Получаем состояние дверей
  const { data: doors, loading: doorsLoading, error: doorsError, refetch: refetchDoors } = useApi(getDoors);

  // Автообновление каждые 10 секунд (тихое обновление)
  useAutoRefresh(() => {
    // Используем тихое обновление, чтобы не показывать состояние загрузки
    refetchState(true);
    refetchDoors(true);
  }, 10000);

  return (
    <div className="dashboard">
      <h1>Главная страница</h1>
      
      {/* Состояние системы */}
      <section className="dashboard-section">
        <h2>Состояние системы</h2>
        {stateLoading && <p>Загрузка...</p>}
        {stateError && (
          <div className="error">
            <p>Ошибка подключения к контроллеру: {stateError}</p>
            <p>Проверьте, что контроллер доступен по адресу: http://192.168.1.50</p>
          </div>
        )}
        {!stateLoading && !stateError && state && (
          <div className="status-cards-grid">
            <StatusCard
              title="Node ID"
              value={state.nodeId ?? '—'}
              status="info"
            />
            <StatusCard
              title="Роль"
              value={state.role === 0 ? 'MASTER' : state.role === 1 ? 'SLAVE' : '—'}
              status="info"
            />
            <StatusCard
              title="Сеть"
              value={state.netReady ? 'Готова' : 'Не готова'}
              status={state.netReady ? 'normal' : 'alarm'}
            />
            <StatusCard
              title="Link"
              value={state.linkUp ? 'UP' : 'DOWN'}
              status={state.linkUp ? 'normal' : 'alarm'}
            />
            <StatusCard
              title="IP адрес"
              value={state.ip ? formatIpAddress(state.ip) : '—'}
              status="info"
            />
            <StatusCard
              title="Время работы"
              value={state.uptimeSeconds !== undefined ? formatUptime(state.uptimeSeconds) : '—'}
              status="info"
            />
          </div>
        )}
      </section>

      {/* Краткий обзор дверей */}
      <section className="dashboard-section">
        <h2>Обзор дверей</h2>
        {doorsLoading && <p>Загрузка...</p>}
        {doorsError && (
          <div className="error">
            <p>Ошибка загрузки дверей: {doorsError}</p>
          </div>
        )}
        {!doorsLoading && !doorsError && doors && <DoorsOverview doors={doors} maxDoors={8} />}
        {!doorsLoading && !doorsError && !doors && <p>Нет данных о дверях</p>}
      </section>
    </div>
  );
};

export default Dashboard;
