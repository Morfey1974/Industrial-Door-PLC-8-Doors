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
 * Эффективный URL API.
 *
 * Важно для npm run dev: страница с localhost, а контроллер на 192.168.x.x — это cross-origin.
 * Тогда срабатывает CORS на МК; если в конфиге задан конкретный Origin (reserved_u32), а не «*»,
 * браузер режет ответы — индикаторы «сети» красные. Поэтому в DEV по умолчанию используем
 * относительный /api и proxy в vite.config.js на VITE_DEV_PROXY_TARGET.
 *
 * Приоритет: ?controller= / ?api= > (в production) localStorage > в DEV относительный /api > дефолт.
 */
export function getEffectiveApiUrl() {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location?.search : '');
  const fromUrl = params.get('controller') || params.get('api');
  if (fromUrl) {
    const base = fromUrl.replace(/\/api\/?$/, '');
    return `${base}/api`;
  }
  if (import.meta.env.DEV) {
    return '/api';
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
  if (import.meta.env.DEV && api === '/api') {
    const t = import.meta.env.VITE_DEV_PROXY_TARGET || 'http://192.168.1.50';
    return `${t} (через Vite → /api)`;
  }
  return api.replace(/\/api\/?$/, '');
}

// Для обратной совместимости
export const API_URL = defaultApiUrl;

/* Макс. размер JSON для PUT /api/config/full — см. HTTP_CONFIG_PUT_MAX (32 КБ) в App/system/http_server.c */
export const PUT_CONFIG_FULL_MAX_JSON_BYTES = 31744;

// Таймауты
export const API_TIMEOUT = 60000; /* Должно быть ≥ STATE_WITH_DOORS_TIMEOUT (api.js), иначе axios режет длинный /state?includeDoors=1 */
/* Тихий опрос (/api/state в шапке): если запрос висит дольше — abort и новый. Для /api/doors в useApi передают silentStuckAbortMs: null (ответ может быть дольше 8 с). */
export const API_SILENT_REFETCH_STUCK_MS = 8000;
export const AUTO_REFRESH_INTERVAL = 1500; // 1.5 секунды для автообновления по умолчанию
/* Раньше дублировался с шапкой и перегружал МК; оставлено для совместимости импортов — не используйте второй таймер на странице дверей. */
export const DOORS_MONITOR_REFRESH_MS = 1000;
/* Не считать кэш протухшим слишком рано при медленном опросе или кратковременных паузах стека. */
export const STATE_HEADER_STALE_MS = 15000;
/* Интервал автоопроса /api/state (шапка + двери). 800 мс — быстрая таблица; обрывы к прокси лечатся
 * корректным close() на МК и одним retry GET в api.js. */
export const HEADER_STATE_POLL_MS = 800;

/** Пути, где запрашивается /api/state?includeDoors=1 (синхронно с StateDataContext). */
export const MONITOR_PATHS_WITH_DOORS = ['/', '/dashboard', '/monitoring/doors'];
/** Нет успешного ответа дольше этого — не показываем «живую» сеть по устаревшему кэшу на экранах с дверями. */
export const MONITOR_DATA_STALE_MS = 12000;

// Роли пользователей
export const USER_ROLES = {
  ADMIN: 'Администратор',
  CLIENT: 'Клиент'
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
