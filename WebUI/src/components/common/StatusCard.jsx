/**
 * StatusCard компонент - карточка для отображения метрик/статуса
 */

import Card from './Card';

const StatusCard = ({ title, value, unit, status, icon }) => {
  // Безопасное преобразование value в строку
  const displayValue = value !== null && value !== undefined ? String(value) : '—';
  
  return (
    <Card className="status-card">
      <div className="status-card-content">
        {icon && <div className="status-card-icon">{icon}</div>}
        <div className="status-card-info">
          <div className="status-card-title">{title || '—'}</div>
          <div className={`status-card-value ${status ? `status-${status}` : ''}`}>
            {displayValue} {unit && <span className="status-card-unit">{unit}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default StatusCard;
