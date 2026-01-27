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
  // TODO: POST /api/auth/logout (когда будет реализовано на backend)
  // Пока просто очищаем localStorage
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  return { ok: 1 };
};

export const getSession = async () => {
  // TODO: GET /api/auth/session (когда будет реализовано на backend)
  // Пока проверяем localStorage
  const token = localStorage.getItem('auth_token');
  const user = localStorage.getItem('auth_user');
  if (token && user) {
    return { ok: 1, user: JSON.parse(user), token };
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
