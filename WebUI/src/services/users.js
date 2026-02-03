/**
 * Users сервис - для работы с пользователями
 */

import apiClient from './api';

export const getUsers = async () => {
  const response = await apiClient.get('/users');
  return response.data;
};

export const createUser = async (userData) => {
  const response = await apiClient.post('/users', userData);
  return response.data;
};

export const updateUser = async (username, userData) => {
  const response = await apiClient.put(`/users/${username}`, userData);
  return response.data;
};

export const deleteUser = async (username) => {
  const response = await apiClient.post(`/users/${username}/delete`, {});
  return response.data;
};
