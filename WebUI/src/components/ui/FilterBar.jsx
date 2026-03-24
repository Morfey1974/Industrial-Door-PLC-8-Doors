/**
 * FilterBar компонент - панель фильтров для таблицы дверей
 */

import Input from '../common/Input';
import Dropdown from '../common/Dropdown';
import Button from '../common/Button';
import { useLanguage } from '../../context/LanguageContext';

const FilterBar = ({ filters, onFilterChange }) => {
  const { t } = useLanguage();
  const handleStatusChange = (e) => {
    onFilterChange({ ...filters, status: e.target.value });
  };

  const handleDoorIdChange = (e) => {
    onFilterChange({ ...filters, doorId: e.target.value });
  };

  const statusOptions = [
    { value: 'all', label: t('pages.doors.filterAll') },
    { value: 'open', label: t('pages.doors.filterOpen') },
    { value: 'closed', label: t('pages.doors.filterClosed') },
    { value: 'alarm', label: t('pages.doors.filterAlarm') },
    { value: 'locked', label: t('pages.doors.filterLocked') },
  ];

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label htmlFor="status-filter">{t('pages.doors.statusLabel')}</label>
        <Dropdown
          id="status-filter"
          value={filters.status || 'all'}
          options={statusOptions}
          onChange={handleStatusChange}
        />
      </div>
      <div className="filter-group">
        <label htmlFor="door-id-filter">{t('pages.doors.doorIdLabel')}</label>
        <Input
          id="door-id-filter"
          type="text"
          value={filters.doorId || ''}
          onChange={handleDoorIdChange}
          placeholder={t('pages.doors.doorIdPlaceholder')}
        />
      </div>
      {(filters.status && filters.status !== 'all') || filters.doorId ? (
        <Button
          variant="secondary"
          onClick={() => onFilterChange({ status: 'all', doorId: '' })}
        >
          {t('pages.doors.resetFilters')}
        </Button>
      ) : null}
    </div>
  );
};

export default FilterBar;
