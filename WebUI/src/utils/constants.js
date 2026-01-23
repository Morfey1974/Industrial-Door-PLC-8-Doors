/**
 * Константы приложения
 */

// Базовый URL API контроллера
// По умолчанию используется IP контроллера из набросков
// Можно изменить через переменные окружения или настройки
// В Vite используем import.meta.env вместо process.env
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://192.168.1.50';

// Порт веб-сервера контроллера (по умолчанию 80, но может быть настроен)
// Если порт 80, не добавляем его в URL (стандартный HTTP порт)
export const API_PORT = import.meta.env.VITE_API_PORT || '80';

// Полный URL API
export const API_URL = API_PORT === '80' 
  ? `${API_BASE_URL}/api`
  : `${API_BASE_URL}:${API_PORT}/api`;

// Таймауты
export const API_TIMEOUT = 5000; // 5 секунд
export const AUTO_REFRESH_INTERVAL = 5000; // 5 секунд для автообновления

// Роли пользователей
export const USER_ROLES = {
  ADMIN: 'Администратор',
  CLIENT: 'Клиент'
};

// Типы событий (из API)
export const EVENT_TYPES = {
  DOOR_OPEN: 'DOOR_OPEN',
  DOOR_CLOSE: 'DOOR_CLOSE',
  DOOR_ALARM: 'DOOR_ALARM',
  DOOR_OPEN_TIMEOUT: 'DOOR_OPEN_TIMEOUT',
  DOOR_POST_CLOSE_READY: 'DOOR_POST_CLOSE_READY',
  DOOR_SIGNAL_ON: 'DOOR_SIGNAL_ON',
  DOOR_SIGNAL_OFF: 'DOOR_SIGNAL_OFF',
  CMD_LOCK: 'CMD_LOCK',
  CMD_UNLOCK: 'CMD_UNLOCK',
  NET_LINK_UP: 'NET_LINK_UP',
  NET_LINK_DOWN: 'NET_LINK_DOWN',
  SYSTEM_FAULT: 'SYSTEM_FAULT'
};

// Источники событий (из API)
export const EVENT_SOURCES = {
  NONE: 'NONE',
  DOOR_LOCAL: 'DOOR_LOCAL',
  SUPERVISOR: 'SUPERVISOR',
  WATCHDOG: 'WATCHDOG',
  CAN: 'CAN',
  RS485: 'RS485',
  HTTP: 'HTTP'
};

// Статусы дверей
export const DOOR_STATUS = {
  CLOSED: 'closed',
  OPEN: 'open',
  ALARM: 'alarm',
  LOCKED: 'locked'
};

// Цвета для статусов
export const STATUS_COLORS = {
  normal: '#00c853',    // Зеленый - норма
  open: '#ff9800',      // Оранжевый - открыта
  alarm: '#d32f2f',     // Красный - авария
  locked: '#3A6577'     // Темно-бирюзовый - заблокирована
};
