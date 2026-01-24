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
    // Игнорируем ошибки отмены запроса
    if (error.code === 'ERR_CANCELED' || error.message === 'canceled') {
      return Promise.reject(error);
    }
    
    if (error.code === 'ECONNABORTED') {
      console.warn('API Request timeout');
      return Promise.reject(new Error('Превышено время ожидания ответа от сервера'));
    }
    if (error.response) {
      // Сервер ответил с кодом ошибки
      const status = error.response.status;
      if (status >= 500) {
        console.error('API Server Error:', status, error.response.data);
      } else {
        console.warn('API Client Error:', status, error.response.data);
      }
      return Promise.reject(error);
    } else if (error.request) {
      // Запрос был отправлен, но ответа не получено
      console.warn('API Network Error - нет ответа от сервера');
      return Promise.reject(new Error('Не удалось подключиться к контроллеру'));
    } else {
      // Ошибка при настройке запроса
      console.warn('API Request Error:', error.message);
      return Promise.reject(error);
    }
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
export const putConfig = async (configData, signal = null) => {
  const config = signal ? { signal } : {};
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

export default apiClient;
