/**
 * FilterBar компонент - панель фильтров для таблицы дверей
 */

import Input from '../common/Input';
import Dropdown from '../common/Dropdown';
import Button from '../common/Button';

const FilterBar = ({ filters, onFilterChange }) => {
  const handleStatusChange = (e) => {
    onFilterChange({ ...filters, status: e.target.value });
  };

  const handleDoorIdChange = (e) => {
    onFilterChange({ ...filters, doorId: e.target.value });
  };

  const statusOptions = [
    { value: 'all', label: 'Все' },
    { value: 'open', label: 'Открытые' },
    { value: 'closed', label: 'Закрытые' },
    { value: 'alarm', label: 'С авариями' },
    { value: 'locked', label: 'Заблокированные' },
  ];

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label htmlFor="status-filter">Статус:</label>
        <Dropdown
          id="status-filter"
          value={filters.status || 'all'}
          options={statusOptions}
          onChange={handleStatusChange}
        />
      </div>
      <div className="filter-group">
        <label htmlFor="door-id-filter">ID двери:</label>
        <Input
          id="door-id-filter"
          type="number"
          value={filters.doorId || ''}
          onChange={handleDoorIdChange}
          placeholder="Все"
          min="1"
          max="8"
        />
      </div>
      {(filters.status && filters.status !== 'all') || filters.doorId ? (
        <Button
          variant="secondary"
          onClick={() => onFilterChange({ status: 'all', doorId: '' })}
        >
          Сбросить фильтры
        </Button>
      ) : null}
    </div>
  );
};

export default FilterBar;
