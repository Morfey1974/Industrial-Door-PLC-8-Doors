/**
 * Утилиты для форматирования данных
 */

/**
 * Форматирование времени из timestamp (Unix timestamp в секундах)
 * @param {number} timestamp - Unix timestamp в секундах
 * @returns {string} Отформатированная дата и время
 */
export const formatTimestamp = (timestamp) => {
  if (!timestamp || timestamp === 0) return 'Не установлено';
  
  // Проверяем, что timestamp не слишком маленький (меньше 1 января 2000 года)
  // Это означает, что RTC не настроен или сброшен
  const minValidTimestamp = 946684800; // 1 января 2000 года 00:00:00 UTC
  if (timestamp < minValidTimestamp) {
    return 'Не установлено';
  }
  
  const date = new Date(timestamp * 1000); // Преобразуем секунды в миллисекунды
  return date.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

/**
 * Форматирование времени в относительном формате (например, "2 минуты назад")
 * @param {number} timestamp - Unix timestamp в секундах
 * @returns {string} Относительное время
 */
export const formatRelativeTime = (timestamp) => {
  if (!timestamp || timestamp === 0) return 'Не установлено';
  
  // Проверяем, что timestamp не слишком маленький
  const minValidTimestamp = 946684800; // 1 января 2000 года 00:00:00 UTC
  if (timestamp < minValidTimestamp) {
    return 'Не установлено';
  }
  
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 0) return 'в будущем'; // На случай если часы впереди
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч. назад`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} дн. назад`;
  
  return formatTimestamp(timestamp);
};

/**
 * Форматирование времени работы (uptime) в читаемый формат
 * @param {number} seconds - Количество секунд
 * @returns {string} Отформатированное время (например, "2д 3ч 15м")
 */
export const formatUptime = (seconds) => {
  if (!seconds) return '0с';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  const parts = [];
  if (days > 0) parts.push(`${days}д`);
  if (hours > 0) parts.push(`${hours}ч`);
  if (minutes > 0) parts.push(`${minutes}м`);
  if (secs > 0 && parts.length === 0) parts.push(`${secs}с`);
  
  return parts.join(' ') || '0с';
};

/**
 * Форматирование IP адреса
 * @param {string} ip - IP адрес
 * @returns {string} Отформатированный IP
 */
export const formatIpAddress = (ip) => {
  if (!ip) return '—';
  return ip;
};

/**
 * Получить цвет для статуса двери
 * @param {object} door - Объект двери
 * @returns {string} Цвет в hex формате
 */
export const getDoorStatusColor = (door) => {
  if (door.alarming) return '#d32f2f'; // Красный - авария
  if (!door.physClosed) return '#ff9800'; // Оранжевый - открыта
  if (door.locked) return '#3A6577'; // Темно-бирюзовый - заблокирована
  return '#00c853'; // Зеленый - норма
};

/**
 * Получить текстовое описание статуса двери
 * @param {object} door - Объект двери
 * @returns {string} Описание статуса
 */
export const getDoorStatusText = (door) => {
  if (door.alarming) return 'Авария';
  if (!door.physClosed) return 'Открыта';
  if (door.locked) return 'Заблокирована';
  return 'Закрыта';
};
