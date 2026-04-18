/**
 * API сервис для взаимодействия с контроллером
 */

import axios from 'axios';
import { getEffectiveApiUrl, API_TIMEOUT } from '../utils/constants';

// Создаем экземпляр axios с базовой конфигурацией
const apiClient = axios.create({
  baseURL: getEffectiveApiUrl(),
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Перед каждым запросом: актуальный URL, Authorization и время с ПК (совместимость с прошивкой)
apiClient.interceptors.request.use((config) => {
  config.baseURL = getEffectiveApiUrl();
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['X-Client-Time'] = Math.floor(Date.now() / 1000);
  return config;
});

// Интерцептор для обработки ошибок
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Игнорируем ошибки отмены запроса (не логируем их)
    if (error.code === 'ERR_CANCELED' || error.message === 'canceled') {
      return Promise.reject(error);
    }

    const cfg = error.config;
    /*
     * Однократный повтор только для GET: прокси Vite → МК часто даёт read ECONNRESET на длинном
     * /api/state?includeDoors=1 (lwIP закрывает сокет). Повтор через короткую паузу обычно проходит.
     * Не трогаем запросы с AbortSignal от useApi (повтор с тем же signal допустим).
     */
    if (cfg && !cfg.__axiosDevRetry && String(cfg.method || 'get').toLowerCase() === 'get') {
      const status = error.response?.status;
      const noResponse = !error.response;
      const msg = String(error.message || '');
      const code = String(error.code || '');
      const netLike =
        noResponse &&
        (code === 'ERR_NETWORK' ||
          code === 'ECONNRESET' ||
          msg.includes('Network Error') ||
          msg.includes('ECONNRESET') ||
          msg.includes('ERR_CONNECTION_RESET'));
      const badGateway = status === 502 || status === 503;
      if (netLike || badGateway) {
        cfg.__axiosDevRetry = true;
        await new Promise((r) => setTimeout(r, 450));
        return apiClient.request(cfg);
      }
    }

    // Обработка таймаута
    if (error.code === 'ECONNABORTED') {
      const timeoutMsg = 'Превышено время ожидания ответа от сервера';
      console.warn('API Request timeout:', error.config?.url || 'unknown');
      return Promise.reject(new Error(timeoutMsg));
    }
    
    // Обработка ответа сервера с кодом ошибки
    if (error.response) {
      const status = error.response.status;
      const url = error.config?.url || 'unknown';
      const data = error.response.data;
      
      if (status === 401) {
        /* Лабораторный режим: токен «open» и прошивка без обязательной авторизации — не сбрасываем сессию. */
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
        if (token !== 'open') {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_user');
          if (typeof window !== 'undefined' && !url.includes('/auth/login')) {
            const appliedAt = sessionStorage.getItem('config_just_applied');
            if (appliedAt && (Date.now() - parseInt(appliedAt, 10)) < 60000) {
              sessionStorage.removeItem('config_just_applied');
              window.location.href = '/monitoring/doors?reason=config_applied';
            } else {
              window.location.href = '/monitoring/doors';
            }
          }
        }
      }
      
      console.error(`API Server Response [${status}]:`, url);
      console.error('Response data:', data);
      if (status >= 500) {
        console.error(`API Server Error [${status}]:`, url, data);
      } else {
        console.warn(`API Client Error [${status}]:`, url, data);
      }
      
      return Promise.reject(error);
    }
    
    // Обработка сетевых ошибок (запрос отправлен, но ответа нет)
    if (error.request) {
      const url = error.config?.url || 'unknown';
      let errorMessage = 'Не удалось подключиться к контроллеру';
      
      // Логируем детали запроса для диагностики
      console.error('API Network Error Details:', {
        url,
        code: error.code,
        message: error.message,
        request: error.request,
        config: error.config,
      });
      
      // Определяем тип сетевой ошибки
      if (error.code === 'ERR_CONNECTION_RESET' || error.message?.includes('ERR_CONNECTION_RESET')) {
        errorMessage = 'Соединение с контроллером разорвано. Проверьте подключение и перезагрузите страницу.';
        console.error(`API Connection Reset:`, url);
      } else if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        // ERR_NETWORK может возникать и при получении ответа, если что-то пошло не так
        // Проверяем, не был ли это ответ с ошибкой, который не распарсился
        errorMessage = 'Ошибка сети. Проверьте подключение к контроллеру.';
        console.error(`API Network Error:`, url, error.code || error.message);
        console.error('Full error object:', error);
      } else if (error.code === 'ERR_INTERNET_DISCONNECTED') {
        errorMessage = 'Нет подключения к интернету.';
        console.error(`API Internet Disconnected:`, url);
      } else {
        // Общая ошибка сети (не логируем как ошибку, только предупреждение)
        console.warn(`API Network Error (${error.code || 'unknown'}):`, url);
      }
      
      return Promise.reject(new Error(errorMessage));
    }
    
    // Ошибка при настройке запроса
    console.warn('API Request Setup Error:', error.message);
    return Promise.reject(error);
  }
);

/**
 * API функции для работы с контроллером
 */

// Лёгкий /state — короткий таймаут; снимок мониторинга (state + doors) на МК с мелкими TCP-чанками часто >15 с.
export const STATE_REQUEST_TIMEOUT = 8000;
export const STATE_WITH_DOORS_TIMEOUT = 55000;
/**
 * @param {AbortSignal|null} signal
 * @param {boolean} includeDoors — один запрос вместо отдельного GET /doors на странице мониторинга
 */
export const getState = async (signal = null, includeDoors = false) => {
  const timeout = includeDoors ? STATE_WITH_DOORS_TIMEOUT : STATE_REQUEST_TIMEOUT;
  const config = { timeout, ...(signal ? { signal } : {}) };
  const url = includeDoors ? '/state?includeDoors=1' : '/state';
  const response = await apiClient.get(url, config);
  return response.data;
};

// Состояние всех дверей: тот же порядок, что и API_TIMEOUT — на МК ответ /api/doors может быть долгим.
export const DOORS_REQUEST_TIMEOUT = 30000;
export const getDoors = async (signal = null) => {
  const config = { timeout: DOORS_REQUEST_TIMEOUT, ...(signal ? { signal } : {}) };
  const response = await apiClient.get('/doors', config);
  return response.data;
};

// Получить конфигурацию
export const getConfig = async (signal = null) => {
  const config = signal ? { signal } : {};
  const response = await apiClient.get('/config', config);
  return response.data;
};

// Обновить конфигурацию (частичное обновление)
// ВАЖНО: Операция сохранения конфигурации в QSPI Flash может занять до 90 секунд
// (стирание сектора ~5-10 сек + запись данных ~5-10 сек + возможные задержки)
export const putConfig = async (configData, signal = null) => {
  const config = {
    timeout: 90000, // 90 секунд для операций записи в Flash (стирание + запись)
    ...(signal ? { signal } : {}),
  };
  const response = await apiClient.put('/config', configData, config);
  return response.data;
};

// Полная очистка пользовательских областей Flash на контроллере.
// Операция длительная (erase нескольких регионов QSPI), после успеха контроллер перезагружается.
export const clearFlash = async (signal = null) => {
  const config = { timeout: 120000, ...(signal ? { signal } : {}) };
  const response = await apiClient.post('/flash/clear', {}, config);
  return response.data;
};

// Сканирование локального flash контроллера (список boards в ответе — одна плата).
export const scanFlashBoards = async (signal = null) => {
  const config = { timeout: 15000, ...(signal ? { signal } : {}) };
  const response = await apiClient.post('/flash/scan', {}, config);
  return response.data;
};

// Очистка flash (bitmask: бит0 = этот контроллер; остальные биты зарезервированы).
// clearService=true включает опасный режим: также стирается служебный раздел users.
export const clearFlashSelected = async (nodesMask, clearService = false, signal = null) => {
  const config = { timeout: 120000, ...(signal ? { signal } : {}) };
  const response = await apiClient.post('/flash/clear', { nodesMask, clearService: clearService ? 1 : 0 }, config);
  return response.data;
};

// Получить полную конфигурацию (все двери, зависимости, таймауты)
// GET запрос быстрее, чем PUT, поэтому используем меньший таймаут
export const getConfigFull = async (signal = null) => {
  const config = {
    timeout: 10000, // 10 секунд для GET запроса (чтение быстрее, чем запись)
    ...(signal ? { signal } : {}),
  };
  const response = await apiClient.get('/config/full', config);
  return response.data;
};

// Получить текущее время контроллера (RTC). Ответ: { ok, unix, source }.
export const getTime = async (signal = null) => {
  const config = signal ? { signal } : {};
  const response = await apiClient.get('/time', config);
  return response.data;
};

// Установить время контроллера (RTC) из Unix timestamp в секундах (для синхронизации с ПК).
export const setTime = async (unixSeconds, signal = null) => {
  const config = { ...(signal ? { signal } : {}) };
  const response = await apiClient.post('/time', { unix: unixSeconds }, config);
  return response.data;
};

// Получить карту маппинга (GET /api/config/mapping)
export const getMapping = async (signal = null) => {
  const config = signal ? { signal } : {};
  const response = await apiClient.get('/config/mapping', config);
  return response.data;
};

// Сохранить карту маппинга (PUT /api/config/mapping)
export const putMapping = async (mappingData, signal = null) => {
  const requestConfig = {
    timeout: 90000,
    ...(signal ? { signal } : {}),
  };
  const response = await apiClient.put('/config/mapping', mappingData, requestConfig);
  return response.data;
};

// Сохранить полную конфигурацию
// ВАЖНО: Операция сохранения конфигурации в QSPI Flash может занять до 90 секунд
// (стирание сектора ~5-10 сек + запись данных ~5-10 сек + возможные задержки)
export const putConfigFull = async (configData, signal = null) => {
  const token = localStorage.getItem('auth_token');
  const requestConfig = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    timeout: 90000, // 90 секунд для операций записи в Flash (стирание + запись)
    ...(signal ? { signal } : {}),
  };
  
  // Логируем данные перед отправкой для отладки
  const jsonString = JSON.stringify(configData);
  const jsonSize = jsonString.length;
  console.log('[API] PUT /config/full request:', {
    doors: configData.doors?.length || 0,
    edges: configData.edges?.length || 0,
    postCloseTimeouts: configData.postCloseTimeouts?.length || 0,
    dataSize: jsonSize,
  });
  
  try {
    const response = await apiClient.put('/config/full', configData, requestConfig);
    console.log('[API] PUT /config/full success:', response.data);
    return response.data;
  } catch (error) {
    // Детальное логирование ошибки
    console.error('[API] PUT /config/full error:', {
      hasResponse: !!error.response,
      hasRequest: !!error.request,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
      code: error.code,
    });
    // Пробрасываем ошибку дальше для обработки в компоненте
    throw error;
  }
};

export default apiClient;
