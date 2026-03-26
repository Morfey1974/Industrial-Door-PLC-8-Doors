/**
 * Doors страница - мониторинг дверей
 */

import { useState } from 'react';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import { useDoorsData } from '../../context/DoorsDataContext';
import { useLanguage } from '../../context/LanguageContext';
import DoorTable from '../../components/ui/DoorTable';
import FilterBar from '../../components/ui/FilterBar';
import Button from '../../components/common/Button';
import { mapApiErrorToUiMessage } from '../../utils/apiErrorI18n';
import './Monitoring.css';

const Doors = () => {
  const { t } = useLanguage();
  const [filters, setFilters] = useState({
    status: 'all',
    doorId: '',
  });

  // Состояние дверей — общий кэш с Дашбордом (при переходе с Дашборда данные уже есть)
  const { data: doors, loading, error, refetch } = useDoorsData();
  const errorText = mapApiErrorToUiMessage(error, t);

  // Автообновление каждые 2.5 с (тихое обновление без показа loading)
  useAutoRefresh(() => {
    // Используем тихое обновление, чтобы не показывать состояние загрузки
    refetch(true);
  }, 2500);

  return (
    <div className="monitoring-doors">
      <div className="page-header">
        <h1>{t('pages.doors.title')}</h1>
        <p>{t('pages.doors.subtitle')}</p>
      </div>

      {/* Панель фильтров и строка: статус, ID двери, всего дверей, Обновить */}
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

      {/* Скелетон таблицы при первой загрузке — страница сразу имеет структуру */}
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

      {/* Обработка ошибок - показываем только если нет данных */}
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

      {/* Таблица дверей - показываем если есть данные, даже при ошибке автообновления */}
      {doors && (
        <div className="doors-table-section">
          <DoorTable doors={doors} filters={filters} />
          {/* Показываем предупреждение об ошибке автообновления, но не скрываем таблицу */}
          {error && doors && (
            <div className="warning-state" style={{ marginTop: '1rem', padding: '0.5rem', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>
                ⚠️ {t('pages.doors.autoRefreshError').replace('{error}', String(errorText))}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Нет данных - показываем только если нет данных и нет ошибки */}
      {!loading && !error && (!doors || !doors.doors || doors.doors.length === 0) && (
        <div className="no-data-state">
          <p>{t('pages.doors.noData')}</p>
        </div>
      )}
    </div>
  );
};

export default Doors;
