/**
 * EventsFilterBar компонент - панель фильтров для журнала событий
 */

import Input from '../common/Input';
import Dropdown from '../common/Dropdown';
import Button from '../common/Button';
import { useLanguage } from '../../context/LanguageContext';

const EventsFilterBar = ({ filters, onFilterChange, onRefresh }) => {
  const { t } = useLanguage();
  const handleEventTypeChange = (e) => {
    onFilterChange({ ...filters, eventType: e.target.value });
  };

  const handleDoorIdChange = (e) => {
    onFilterChange({ ...filters, doorId: e.target.value });
  };

  const eventTypeOptions = [
    { value: 'all', label: t('pages.events.filterAllTypes') },
    { value: 'DOOR_OPEN', label: t('pages.events.filterDoorOpen') },
    { value: 'DOOR_CLOSE', label: t('pages.events.filterDoorClose') },
    { value: 'DOOR_ALARM', label: t('pages.events.filterDoorAlarm') },
    { value: 'CMD_LOCK', label: t('pages.events.filterCmdLock') },
    { value: 'CMD_UNLOCK', label: t('pages.events.filterCmdUnlock') },
    { value: 'NET_LINK_UP', label: t('pages.events.filterNetLinkUp') },
    { value: 'NET_LINK_DOWN', label: t('pages.events.filterNetLinkDown') },
    { value: 'SYSTEM_FAULT', label: t('pages.events.filterSystemFault') },
  ];

  const hasActiveFilters =
    (filters.eventType && filters.eventType !== 'all') ||
    filters.doorId;

  return (
    <div className="filter-bar filter-bar--events">
      <div className="filter-group">
        <label htmlFor="event-type-filter">{t('pages.events.filterTypeLabel')}</label>
        <Dropdown
          id="event-type-filter"
          value={filters.eventType || 'all'}
          options={eventTypeOptions}
          onChange={handleEventTypeChange}
        />
      </div>
      <div className="filter-group">
        <label htmlFor="door-id-filter">{t('pages.events.filterDoorIdLabel')}</label>
        <Input
          id="door-id-filter"
          type="text"
          value={filters.doorId || ''}
          onChange={handleDoorIdChange}
          placeholder={t('pages.events.filterDoorIdPlaceholder')}
        />
      </div>
      {onRefresh && (
        <Button variant="secondary" size="small" onClick={onRefresh}>
          {t('common.refresh')}
        </Button>
      )}
      {hasActiveFilters && (
        <Button
          variant="secondary"
          size="small"
          onClick={() => onFilterChange({ eventType: 'all', doorId: '' })}
        >
          {t('pages.events.resetFilters')}
        </Button>
      )}
    </div>
  );
};

export default EventsFilterBar;
