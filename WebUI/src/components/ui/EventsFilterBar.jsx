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

  const handleSourceChange = (e) => {
    onFilterChange({ ...filters, source: e.target.value });
  };

  const eventTypeOptions = [
    { value: 'all', label: t('pages.events.filterAllTypes') },
    { value: 'DOOR_OPEN', label: t('pages.events.filterDoorOpen') },
    { value: 'DOOR_CLOSE', label: t('pages.events.filterDoorClose') },
    { value: 'DOOR_ALARM', label: t('pages.events.filterDoorAlarm') },
    { value: 'DOOR_OPEN_TIMEOUT', label: t('pages.events.filterDoorOpenTimeout') },
    { value: 'DOOR_POST_CLOSE_READY', label: t('pages.events.filterDoorPostCloseReady') },
    { value: 'DOOR_SIGNAL_ON', label: t('pages.events.filterDoorSignalOn') },
    { value: 'DOOR_SIGNAL_OFF', label: t('pages.events.filterDoorSignalOff') },
    { value: 'CMD_LOCK', label: t('pages.events.filterCmdLock') },
    { value: 'CMD_UNLOCK', label: t('pages.events.filterCmdUnlock') },
    { value: 'NET_LINK_UP', label: t('pages.events.filterNetLinkUp') },
    { value: 'NET_LINK_DOWN', label: t('pages.events.filterNetLinkDown') },
    { value: 'SYSTEM_FAULT', label: t('pages.events.filterSystemFault') },
  ];

  const sourceOptions = [
    { value: 'all', label: t('pages.events.filterAllSources') },
    { value: 'NONE', label: t('pages.events.sourceNone') },
    { value: 'DOOR_LOCAL', label: t('pages.events.sourceDoorLocal') },
    { value: 'SUPERVISOR', label: t('pages.events.sourceSupervisor') },
    { value: 'WATCHDOG', label: t('pages.events.sourceWatchdog') },
    { value: 'CAN', label: 'CAN' },
    { value: 'RS485', label: 'RS485' },
    { value: 'HTTP', label: 'HTTP' },
  ];

  const hasActiveFilters =
    (filters.eventType && filters.eventType !== 'all') ||
    filters.doorId ||
    (filters.source && filters.source !== 'all');

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
      <div className="filter-group">
        <label htmlFor="source-filter">{t('pages.events.filterSourceLabel')}</label>
        <Dropdown
          id="source-filter"
          value={filters.source || 'all'}
          options={sourceOptions}
          onChange={handleSourceChange}
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
          onClick={() => onFilterChange({ eventType: 'all', doorId: '', source: 'all' })}
        >
          {t('pages.events.resetFilters')}
        </Button>
      )}
    </div>
  );
};

export default EventsFilterBar;
