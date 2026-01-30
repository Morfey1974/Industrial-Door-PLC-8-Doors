import { formatDoorId } from '../../utils/formatters';

/**
 * DoorCard компонент - карточка двери
 */
const DoorCard = ({ door }) => {
  return (
    <div className="door-card">
      <div className="door-card-header">
        <h3>{formatDoorId(door)}</h3>
        <span className={`door-status status-${door.alarming ? 'alarm' : door.physClosed ? 'closed' : 'open'}`}>
          {door.alarming ? 'Авария' : door.physClosed ? 'Закрыта' : 'Открыта'}
        </span>
      </div>
      <div className="door-card-body">
        <p>Замок: {door.locked ? 'Заблокирована' : 'Разблокирована'}</p>
        {door.openSeconds > 0 && <p>Открыта: {door.openSeconds} сек</p>}
      </div>
    </div>
  );
};

export default DoorCard;
