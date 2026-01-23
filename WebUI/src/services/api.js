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
    if (error.code === 'ECONNABORTED') {
      console.error('API Request timeout');
      return Promise.reject(new Error('Превышено время ожидания ответа от сервера'));
    }
    if (error.response) {
      // Сервер ответил с кодом ошибки
      console.error('API Error:', error.response.status, error.response.data);
      return Promise.reject(error);
    } else if (error.request) {
      // Запрос был отправлен, но ответа не получено
      console.error('API Network Error:', error.request);
      return Promise.reject(new Error('Не удалось подключиться к контроллеру'));
    } else {
      // Ошибка при настройке запроса
      console.error('API Error:', error.message);
      return Promise.reject(error);
    }
  }
);

/**
 * API функции для работы с контроллером
 */

// Получить состояние системы
export const getState = async () => {
  const response = await apiClient.get('/state');
  return response.data;
};

// Получить состояние всех дверей
export const getDoors = async () => {
  const response = await apiClient.get('/doors');
  return response.data;
};

// Получить конфигурацию
export const getConfig = async () => {
  const response = await apiClient.get('/config');
  return response.data;
};

// Обновить конфигурацию (частичное обновление)
export const putConfig = async (configData) => {
  const response = await apiClient.put('/config', configData);
  return response.data;
};

// Получить статистику журнала
export const getJournalStat = async () => {
  const response = await apiClient.get('/journal/stat');
  return response.data;
};

// Получить записи журнала с пагинацией
export const getJournalDump = async (offset = 0, limit = 20) => {
  const response = await apiClient.get('/journal/dump', {
    params: { offset, limit }
  });
  return response.data;
};

export default apiClient;
