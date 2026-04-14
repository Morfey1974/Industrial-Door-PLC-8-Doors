/**
 * Auth сервис — опциональная проверка сессии на контроллере (без формы входа в UI).
 */

import apiClient from './api';

export const getSession = async () => {
  const token = localStorage.getItem('auth_token');
  if (!token) return { ok: 0 };
  try {
    const response = await apiClient.get('/auth/session');
    if (response.data?.ok === 1 && response.data?.user) {
      return { ok: 1, user: response.data.user, token };
    }
  } catch (err) {
    if (err.response?.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    }
  }
  return { ok: 0 };
};
