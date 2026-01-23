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

  // Автообновление каждые 5 секунд
  useAutoRefresh(() => {
    try {
      refetch();
    } catch (error) {
      console.error('Auto refresh error:', error);
    }
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

      {/* Состояние загрузки */}
      {loading && (
        <div className="loading-state">
          <p>Загрузка данных о дверях...</p>
        </div>
      )}

      {/* Обработка ошибок */}
      {error && (
        <div className="error-state">
          <h3>Ошибка загрузки данных</h3>
          <p>{error}</p>
          <p>Проверьте, что контроллер доступен по адресу: http://192.168.1.50</p>
          <Button variant="primary" onClick={refetch}>
            Повторить попытку
          </Button>
        </div>
      )}

      {/* Таблица дверей */}
      {!loading && !error && doors && (
        <div className="doors-table-section">
          <DoorTable doors={doors} filters={filters} />
        </div>
      )}

      {/* Нет данных */}
      {!loading && !error && (!doors || !doors.doors || doors.doors.length === 0) && (
        <div className="no-data-state">
          <p>Нет данных о дверях</p>
        </div>
      )}
    </div>
  );
};

export default Doors;
