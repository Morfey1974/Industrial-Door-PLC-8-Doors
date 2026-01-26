/**
 * API сервис для взаимодействия с контроллером
 */

import axios from 'axios';
import { API_URL, API_TIMEOUT } from '../utils/constants';

// Создаем экземпляр axios с базовой конфигурацией
const apiClient = axios.create({
  baseURL: API_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Интерцептор для обработки ошибок
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Игнорируем ошибки отмены запроса (не логируем их)
    if (error.code === 'ERR_CANCELED' || error.message === 'canceled') {
      return Promise.reject(error);
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
      if (status >= 500) {
        console.error(`API Server Error [${status}]:`, url, error.response.data);
      } else {
        console.warn(`API Client Error [${status}]:`, url, error.response.data);
      }
      return Promise.reject(error);
    }
    
    // Обработка сетевых ошибок (запрос отправлен, но ответа нет)
    if (error.request) {
      const url = error.config?.url || 'unknown';
      let errorMessage = 'Не удалось подключиться к контроллеру';
      
      // Определяем тип сетевой ошибки
      if (error.code === 'ERR_CONNECTION_RESET' || error.message?.includes('ERR_CONNECTION_RESET')) {
        errorMessage = 'Соединение с контроллером разорвано. Проверьте подключение и перезагрузите страницу.';
        console.error(`API Connection Reset:`, url);
      } else if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        errorMessage = 'Ошибка сети. Проверьте подключение к контроллеру.';
        console.error(`API Network Error:`, url, error.code || error.message);
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

// Получить состояние системы
export const getState = async (signal = null) => {
  const config = signal ? { signal } : {};
  const response = await apiClient.get('/state', config);
  return response.data;
};

// Получить состояние всех дверей
export const getDoors = async (signal = null) => {
  const config = signal ? { signal } : {};
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

// Получить статистику журнала
export const getJournalStat = async (signal = null) => {
  const config = signal ? { signal } : {};
  const response = await apiClient.get('/journal/stat', config);
  return response.data;
};

// Получить записи журнала с пагинацией
export const getJournalDump = async (offset = 0, limit = 20, signal = null) => {
  const config = signal ? { signal, params: { offset, limit } } : { params: { offset, limit } };
  const response = await apiClient.get('/journal/dump', config);
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

// Сохранить полную конфигурацию
// ВАЖНО: Операция сохранения конфигурации в QSPI Flash может занять до 90 секунд
// (стирание сектора ~5-10 сек + запись данных ~5-10 сек + возможные задержки)
export const putConfigFull = async (configData, signal = null) => {
  const requestConfig = {
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 90000, // 90 секунд для операций записи в Flash (стирание + запись)
    ...(signal ? { signal } : {}),
  };
  
  // Логируем данные перед отправкой для отладки
  console.log('[API] PUT /config/full request:', {
    data: configData,
    dataSize: JSON.stringify(configData).length,
  });
  
  const response = await apiClient.put('/config/full', configData, requestConfig);
  return response.data;
};

export default apiClient;
