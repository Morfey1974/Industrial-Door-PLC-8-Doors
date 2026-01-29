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
    <div className="dashboard" style={{ position: 'relative' }}>
      <h1>Главная страница</h1>
      
      {/* Состояние системы - в правом верхнем углу, в одну строчку */}
      {!stateLoading && !stateError && state && (
        <div style={{ 
          position: 'absolute',
          top: '0',
          right: '0',
          display: 'flex',
          flexDirection: 'row',
          gap: '20px',
          alignItems: 'center',
          padding: '10px',
          flexWrap: 'wrap'
        }}>
          {/* Индикаторы Сеть и Link в виде кружков */}
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            {/* Индикатор Сеть */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  backgroundColor: state.netReady ? '#28a745' : '#dc3545',
                  border: '2px solid ' + (state.netReady ? '#1e7e34' : '#c82333'),
                  boxShadow: state.netReady ? '0 0 8px rgba(40, 167, 69, 0.5)' : 'none'
                }}
                title={state.netReady ? 'Сеть готова' : 'Сеть не готова'}
              />
              <span style={{ fontSize: '11px', color: '#666' }}>Сеть</span>
              {!state.netReady && (
                <span style={{ fontSize: '10px', color: '#dc3545', marginTop: '2px' }}>Нет сети</span>
              )}
            </div>
            
            {/* Индикатор Link */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  backgroundColor: state.linkUp ? '#28a745' : '#dc3545',
                  border: '2px solid ' + (state.linkUp ? '#1e7e34' : '#c82333'),
                  boxShadow: state.linkUp ? '0 0 8px rgba(40, 167, 69, 0.5)' : 'none'
                }}
                title={state.linkUp ? 'Link UP' : 'Link DOWN'}
              />
              <span style={{ fontSize: '11px', color: '#666' }}>Link</span>
              {!state.linkUp && (
                <span style={{ fontSize: '10px', color: '#dc3545', marginTop: '2px' }}>Нет линка</span>
              )}
            </div>
          </div>
          
          {/* IP адрес */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '2px' }}>IP адрес</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>
              {state.ip ? formatIpAddress(state.ip) : '—'}
            </div>
          </div>
          
          {/* Время работы */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '2px' }}>Время работы</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>
              {state.uptimeSeconds !== undefined ? formatUptime(state.uptimeSeconds) : '—'}
            </div>
          </div>
        </div>
      )}
      
      {/* Обработка ошибок состояния системы */}
      {stateError && (
        <div className="error" style={{ marginBottom: '20px' }}>
          <p>Ошибка подключения к контроллеру: {stateError}</p>
          <p>Проверьте, что контроллер доступен по адресу: http://192.168.1.50</p>
        </div>
      )}

      {/* Краткий обзор дверей */}
      <section className="dashboard-section">
        <h2>Обзор дверей</h2>
        {doorsLoading && <p>Загрузка...</p>}
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
