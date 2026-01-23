/**
 * StatusBadge компонент - индикатор статуса
 */

const StatusBadge = ({ status, label }) => {
  return (
    <span className={`status-badge status-${status}`}>
      {label || status}
    </span>
  );
};

export default StatusBadge;
