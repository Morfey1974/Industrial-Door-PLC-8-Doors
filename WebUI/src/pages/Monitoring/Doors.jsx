/**
 * Doors страница - мониторинг дверей
 */

import { useState } from 'react';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import { useDoorsData } from '../../context/DoorsDataContext';
import DoorTable from '../../components/ui/DoorTable';
import FilterBar from '../../components/ui/FilterBar';
import Button from '../../components/common/Button';

const Doors = () => {
  const [filters, setFilters] = useState({
    status: 'all',
    doorId: '',
  });

  // Состояние дверей — общий кэш с Дашбордом (при переходе с Дашборда данные уже есть)
  const { data: doors, loading, error, refetch } = useDoorsData();

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

      {/* Информация о количестве дверей и миниатюрная кнопка Обновить слева */}
      {!loading && !error && doors && doors.doors && (
        <div className="doors-info doors-info-row">
          <Button variant="secondary" size="small" onClick={() => refetch(false)}>
            Обновить
          </Button>
          <p className="doors-info-text">
            Всего дверей: <strong>{doors.doors.length}</strong>
          </p>
        </div>
      )}

      {/* Скелетон таблицы при первой загрузке — страница сразу имеет структуру */}
      {loading && !doors && (
        <div className="doors-table-section door-table-skeleton" aria-busy="true">
          <div className="door-table" style={{ padding: '1rem' }}>
            <p style={{ margin: '0 0 0.75rem 0', color: 'var(--color-text-dark)' }}>Загрузка данных о дверях…</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['ID', 'Статус', 'Физически закрыта', 'Замок', 'Авария', 'Открыта (сек)'].map((h) => (
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
              Ожидание ответа до 15 с. Проверьте подключение к контроллеру при долгой загрузке.
            </p>
          </div>
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
