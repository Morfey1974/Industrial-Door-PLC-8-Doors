/**
 * Константы приложения
 */

const STORAGE_KEY = 'plc_controller_url';

// Базовый URL API контроллера (значения по умолчанию)
const DEFAULT_BASE = import.meta.env.VITE_API_BASE_URL || 'http://192.168.1.50';
const DEFAULT_PORT = import.meta.env.VITE_API_PORT || '80';

const defaultApiUrl = DEFAULT_PORT === '80'
  ? `${DEFAULT_BASE}/api`
  : `${DEFAULT_BASE}:${DEFAULT_PORT}/api`;

/**
 * Эффективный URL API: URL-параметр ?controller= > localStorage > сборка.
 * Позволяет подключаться с другого компьютера без пересборки.
 */
export function getEffectiveApiUrl() {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location?.search : '');
  const fromUrl = params.get('controller') || params.get('api');
  if (fromUrl) {
    const base = fromUrl.replace(/\/api\/?$/, '');
    return `${base}/api`;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored.trim()) {
      const base = stored.trim().replace(/\/api\/?$/, '');
      return `${base}/api`;
    }
  } catch (_) {}
  return defaultApiUrl;
}

export function saveControllerUrl(url) {
  try {
    const base = (url || '').trim().replace(/\/api\/?$/, '');
    if (base) {
      localStorage.setItem(STORAGE_KEY, base);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    return true;
  } catch (_) {
    return false;
  }
}

export function getControllerUrlForDisplay() {
  const api = getEffectiveApiUrl();
  return api.replace(/\/api\/?$/, '');
}

// Для обратной совместимости
export const API_URL = defaultApiUrl;

/* Макс. размер JSON для PUT /api/config/full — см. HTTP_CONFIG_PUT_MAX (32 КБ) в App/system/http_server.c */
export const PUT_CONFIG_FULL_MAX_JSON_BYTES = 31744;

// Таймауты
export const API_TIMEOUT = 30000; // 30 секунд (увеличено для медленных соединений)
export const AUTO_REFRESH_INTERVAL = 5000; // 5 секунд для автообновления по умолчанию
/* Мониторинг дверей: однопоточный HTTP на МК — при медленном ответе тихие refetch раньше терялись; см. useApi pendingSilentRefetchRef */
export const DOORS_MONITOR_REFRESH_MS = 1500;

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
  alarm: '#d32f2f',     // Красный - Alarm
  locked: '#3A6577'     // Темно-бирюзовый - заблокирована
};
