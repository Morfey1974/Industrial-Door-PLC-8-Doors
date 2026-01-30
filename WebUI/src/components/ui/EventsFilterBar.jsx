/**
 * EventsFilterBar компонент - панель фильтров для журнала событий
 */

import Input from '../common/Input';
import Dropdown from '../common/Dropdown';
import Button from '../common/Button';

const EventsFilterBar = ({ filters, onFilterChange }) => {
  const handleEventTypeChange = (e) => {
    onFilterChange({ ...filters, eventType: e.target.value });
  };

  const handleDoorIdChange = (e) => {
    onFilterChange({ ...filters, doorId: e.target.value });
  };

  const handleSourceChange = (e) => {
    onFilterChange({ ...filters, source: e.target.value });
  };

  const eventTypeOptions = [
    { value: 'all', label: 'Все типы' },
    { value: 'DOOR_OPEN', label: 'Открытие двери' },
    { value: 'DOOR_CLOSE', label: 'Закрытие двери' },
    { value: 'DOOR_ALARM', label: 'Авария двери' },
    { value: 'DOOR_OPEN_TIMEOUT', label: 'Таймаут открытия' },
    { value: 'DOOR_POST_CLOSE_READY', label: 'Готовность после закрытия' },
    { value: 'DOOR_SIGNAL_ON', label: 'Сигнал включен' },
    { value: 'DOOR_SIGNAL_OFF', label: 'Сигнал выключен' },
    { value: 'CMD_LOCK', label: 'Команда блокировки' },
    { value: 'CMD_UNLOCK', label: 'Команда разблокировки' },
    { value: 'NET_LINK_UP', label: 'Сеть подключена' },
    { value: 'NET_LINK_DOWN', label: 'Сеть отключена' },
    { value: 'SYSTEM_FAULT', label: 'Системная ошибка' },
  ];

  const sourceOptions = [
    { value: 'all', label: 'Все источники' },
    { value: 'NONE', label: 'Нет' },
    { value: 'DOOR_LOCAL', label: 'Локальная дверь' },
    { value: 'SUPERVISOR', label: 'Супервизор' },
    { value: 'WATCHDOG', label: 'Сторожевой таймер' },
    { value: 'CAN', label: 'CAN' },
    { value: 'RS485', label: 'RS485' },
    { value: 'HTTP', label: 'HTTP' },
  ];

  const hasActiveFilters =
    (filters.eventType && filters.eventType !== 'all') ||
    filters.doorId ||
    (filters.source && filters.source !== 'all');

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label htmlFor="event-type-filter">Тип события:</label>
        <Dropdown
          id="event-type-filter"
          value={filters.eventType || 'all'}
          options={eventTypeOptions}
          onChange={handleEventTypeChange}
        />
      </div>
      <div className="filter-group">
        <label htmlFor="door-id-filter">ID двери:</label>
        <Input
          id="door-id-filter"
          type="text"
          value={filters.doorId || ''}
          onChange={handleDoorIdChange}
          placeholder="ID-1-1 или 1-1"
        />
      </div>
      <div className="filter-group">
        <label htmlFor="source-filter">Источник:</label>
        <Dropdown
          id="source-filter"
          value={filters.source || 'all'}
          options={sourceOptions}
          onChange={handleSourceChange}
        />
      </div>
      {hasActiveFilters && (
        <Button
          variant="secondary"
          onClick={() => onFilterChange({ eventType: 'all', doorId: '', source: 'all' })}
        >
          Сбросить фильтры
        </Button>
      )}
    </div>
  );
};

export default EventsFilterBar;
