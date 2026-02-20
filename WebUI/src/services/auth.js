/**
 * Auth сервис - для работы с аутентификацией
 */

import apiClient from './api';

export const login = async (username, password) => {
  // API_URL уже содержит /api, поэтому путь должен быть /auth/login
  const response = await apiClient.post('/auth/login', {
    username,
    password,
  });
  return response.data;
};

export const logout = async () => {
  try {
    await apiClient.post('/auth/logout');
  } catch (_) {
    /* Игнорируем ошибку (токен уже недействителен и т.д.), всё равно очищаем сессию */
  }
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  return { ok: 1 };
};

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

export const changePassword = async (currentPassword, newPassword) => {
  const response = await apiClient.post('/auth/change-password', {
    currentPassword,
    newPassword,
  });
  return response.data;
};

export const requestPasswordReset = async (username) => {
  const response = await apiClient.post('/auth/forgot-password', { username });
  return response.data;
};

export const resetPassword = async (token, newPassword) => {
  const response = await apiClient.post('/auth/reset-password', {
    token,
    newPassword,
  });
  return response.data;
};
