/**
 * Doors страница - мониторинг дверей
 */

import { useState } from 'react';
import useApi from '../../hooks/useApi';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import { getDoors } from '../../services/api';
import DoorTable from '../../components/ui/DoorTable';
import FilterBar from '../../components/ui/FilterBar';
import Button from '../../components/common/Button';

const Doors = () => {
  const [filters, setFilters] = useState({
    status: 'all',
    doorId: '',
  });

  // Получаем состояние дверей
  const { data: doors, loading, error, refetch } = useApi(getDoors);

  // Автообновление каждые 5 секунд (тихое обновление без показа loading)
  useAutoRefresh(() => {
    // Используем тихое обновление, чтобы не показывать состояние загрузки
    refetch(true);
  }, 5000);

  return (
    <div className="monitoring-doors">
      <div className="page-header">
        <h1>Мониторинг дверей</h1>
        <p>Полная таблица состояния всех дверей системы</p>
      </div>

      {/* Панель фильтров */}
      <div className="filters-section">
        <FilterBar filters={filters} onFilterChange={setFilters} />
      </div>

      {/* Информация о количестве дверей */}
      {!loading && !error && doors && doors.doors && (
        <div className="doors-info">
          <p>
            Всего дверей: <strong>{doors.doors.length}</strong>
          </p>
        </div>
      )}

      {/* Состояние загрузки - показываем только при первой загрузке */}
      {loading && !doors && (
        <div className="loading-state">
          <p>Загрузка данных о дверях...</p>
          <p style={{ fontSize: '0.875rem', opacity: 0.7, marginTop: '0.5rem' }}>
            Это может занять до 30 секунд. Если загрузка не завершается, проверьте подключение к контроллеру.
          </p>
        </div>
      )}

      {/* Обработка ошибок - показываем только если нет данных */}
      {error && !doors && (
        <div className="error-state">
          <h3>Ошибка загрузки данных</h3>
          <p>{error}</p>
          <p>Проверьте, что контроллер доступен по адресу: http://192.168.1.50</p>
          <Button variant="primary" onClick={() => refetch(false)}>
            Повторить попытку
          </Button>
        </div>
      )}

      {/* Таблица дверей - показываем если есть данные, даже при ошибке автообновления */}
      {doors && (
        <div className="doors-table-section">
          <DoorTable doors={doors} filters={filters} />
          {/* Показываем предупреждение об ошибке автообновления, но не скрываем таблицу */}
          {error && doors && (
            <div className="warning-state" style={{ marginTop: '1rem', padding: '0.5rem', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>
                ⚠️ Ошибка автообновления: {error}. Данные могут быть устаревшими.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Нет данных - показываем только если нет данных и нет ошибки */}
      {!loading && !error && (!doors || !doors.doors || doors.doors.length === 0) && (
        <div className="no-data-state">
          <p>Нет данных о дверях</p>
        </div>
      )}
    </div>
  );
};

export default Doors;
