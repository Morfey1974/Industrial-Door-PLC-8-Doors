/**
 * Config сервис - для управления конфигурацией
 */

import { getConfig, putConfig } from './api';

export const loadConfig = async () => {
  return await getConfig();
};

export const saveConfig = async (configData) => {
  return await putConfig(configData);
};

export const validateConfig = (config) => {
  // TODO: Добавить валидацию конфигурации
  return { valid: true, errors: [] };
};
