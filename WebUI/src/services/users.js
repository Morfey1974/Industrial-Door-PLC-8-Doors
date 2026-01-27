/**
 * Users сервис - для работы с пользователями
 */

import apiClient from './api';

export const getUsers = async (currentUser) => {
  const url = currentUser ? `/users?currentUser=${encodeURIComponent(currentUser)}` : '/users';
  const response = await apiClient.get(url);
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

export const deleteUser = async (username, currentUser) => {
  const response = await apiClient.post(`/users/${username}/delete`, {
    currentUser
  });
  return response.data;
};
