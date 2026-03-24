import { formatDoorId } from '../../utils/formatters';
import { useLanguage } from '../../context/LanguageContext';

/**
 * DoorCard компонент - карточка двери
 */
const DoorCard = ({ door }) => {
  const { t } = useLanguage();
  return (
    <div className="door-card">
      <div className="door-card-header">
        <h3>{formatDoorId(door)}</h3>
        <span className={`door-status status-${door.alarming ? 'alarm' : door.physClosed ? 'closed' : 'open'}`}>
          {door.alarming ? t('pages.doors.statusAlarm') : door.physClosed ? t('pages.doors.statusClosed') : t('pages.doors.statusOpen')}
        </span>
      </div>
      <div className="door-card-body">
        <p>{t('pages.doors.colLock')}: {door.locked ? t('pages.doors.lockedValue') : t('pages.doors.unlockedValue')}</p>
        {door.openSeconds > 0 && <p>{t('pages.doors.colOpenSeconds')}: {door.openSeconds}</p>}
      </div>
    </div>
  );
};

export default DoorCard;
