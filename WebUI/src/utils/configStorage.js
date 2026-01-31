/**
 * Утилиты для работы с автосохранением конфигурации в LocalStorage
 * 
 * Функции:
 * - Автосохранение черновика конфигурации
 * - Восстановление черновика при загрузке
 * - Сохранение именованных конфигураций
 * - Экспорт/импорт JSON файлов
 */

import { FILE_PICKER_ID_CONFIGS } from '../constants/filePaths';

const STORAGE_KEYS = {
  DRAFT: 'config_draft',
  LIST: 'config_list',
  CURRENT: 'config_current_name',
};

/**
 * Сохранить черновик конфигурации в LocalStorage
 * @param {Object} config - Объект конфигурации
 */
export const saveDraft = (config) => {
  try {
    const draft = {
      timestamp: new Date().toISOString(),
      ...config,
    };
    localStorage.setItem(STORAGE_KEYS.DRAFT, JSON.stringify(draft));
    return true;
  } catch (error) {
    console.error('Ошибка сохранения черновика:', error);
    return false;
  }
};

/**
 * Загрузить черновик конфигурации из LocalStorage
 * @returns {Object|null} Черновик конфигурации или null
 */
export const loadDraft = () => {
  try {
    const draftStr = localStorage.getItem(STORAGE_KEYS.DRAFT);
    if (!draftStr) return null;
    return JSON.parse(draftStr);
  } catch (error) {
    console.error('Ошибка загрузки черновика:', error);
    return null;
  }
};

/**
 * Удалить черновик из LocalStorage
 */
export const clearDraft = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.DRAFT);
    return true;
  } catch (error) {
    console.error('Ошибка удаления черновика:', error);
    return false;
  }
};

/**
 * Получить список всех сохраненных конфигураций
 * @returns {Array} Массив объектов {name, doorCount, timestamp}
 */
export const getSavedConfigsList = () => {
  try {
    const listStr = localStorage.getItem(STORAGE_KEYS.LIST);
    if (!listStr) return [];
    return JSON.parse(listStr);
  } catch (error) {
    console.error('Ошибка загрузки списка конфигураций:', error);
    return [];
  }
};

/**
 * Сохранить именованную конфигурацию
 * @param {string} name - Имя конфигурации
 * @param {Object} config - Объект конфигурации
 */
export const saveNamedConfig = (name, config) => {
  try {
    // Сохраняем саму конфигурацию
    const configData = {
      name,
      timestamp: new Date().toISOString(),
      doorCount: config.doors?.length || 0,
      config,
    };
    localStorage.setItem(`config_saved_${name}`, JSON.stringify(configData));
    
    // Обновляем список конфигураций
    const list = getSavedConfigsList();
    const existingIndex = list.findIndex(item => item.name === name);
    const listItem = {
      name,
      doorCount: config.doors?.length || 0,
      timestamp: new Date().toISOString(),
    };
    
    if (existingIndex >= 0) {
      list[existingIndex] = listItem;
    } else {
      list.push(listItem);
    }
    
    localStorage.setItem(STORAGE_KEYS.LIST, JSON.stringify(list));
    return true;
  } catch (error) {
    console.error('Ошибка сохранения именованной конфигурации:', error);
    return false;
  }
};

/**
 * Загрузить именованную конфигурацию
 * @param {string} name - Имя конфигурации
 * @returns {Object|null} Конфигурация или null
 */
export const loadNamedConfig = (name) => {
  try {
    const configStr = localStorage.getItem(`config_saved_${name}`);
    if (!configStr) return null;
    const configData = JSON.parse(configStr);
    return configData.config;
  } catch (error) {
    console.error('Ошибка загрузки именованной конфигурации:', error);
    return null;
  }
};

/**
 * Удалить именованную конфигурацию
 * @param {string} name - Имя конфигурации
 */
export const deleteNamedConfig = (name) => {
  try {
    localStorage.removeItem(`config_saved_${name}`);
    
    // Удаляем из списка
    const list = getSavedConfigsList();
    const filteredList = list.filter(item => item.name !== name);
    localStorage.setItem(STORAGE_KEYS.LIST, JSON.stringify(filteredList));
    
    return true;
  } catch (error) {
    console.error('Ошибка удаления конфигурации:', error);
    return false;
  }
};

/**
 * Экспортировать конфигурацию в JSON файл.
 * Если доступен File System Access API (Chrome/Edge) — открывает окно «Сохранить как»
 * для выбора пути. Иначе — скачивание в папку по умолчанию.
 * @param {Object} config - Объект конфигурации
 * @param {string} filename - Предлагаемое имя файла
 * @returns {Promise<{ok: boolean, cancelled?: boolean, filename?: string}>}
 */
export const exportConfigToFile = async (config, filename = 'config.json') => {
  try {
    const jsonStr = JSON.stringify(config, null, 2);
    if (typeof window.showSaveFilePicker === 'function') {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        id: FILE_PICKER_ID_CONFIGS,
        startIn: 'documents',
      });
      const w = await handle.createWritable();
      await w.write(jsonStr);
      await w.close();
      return { ok: true, filename: handle.name || filename };
    }
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return { ok: true, filename };
  } catch (error) {
    if (error?.name === 'AbortError') return { ok: false, cancelled: true };
    console.error('Ошибка экспорта конфигурации:', error);
    return { ok: false };
  }
};

/**
 * Импортировать конфигурацию из JSON файла
 * @param {File} file - Файл JSON
 * @returns {Promise<Object>} Промис с объектом конфигурации
 */
export const importConfigFromFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const config = JSON.parse(e.target.result);
        resolve(config);
      } catch (error) {
        reject(new Error('Неверный формат JSON файла'));
      }
    };
    reader.onerror = () => {
      reject(new Error('Ошибка чтения файла'));
    };
    reader.readAsText(file);
  });
};

/**
 * Получить имя текущей конфигурации
 * @returns {string|null}
 */
export const getCurrentConfigName = () => {
  try {
    return localStorage.getItem(STORAGE_KEYS.CURRENT);
  } catch (error) {
    return null;
  }
};

/**
 * Установить имя текущей конфигурации
 * @param {string} name - Имя конфигурации
 */
export const setCurrentConfigName = (name) => {
  try {
    if (name) {
      localStorage.setItem(STORAGE_KEYS.CURRENT, name);
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT);
    }
    return true;
  } catch (error) {
    console.error('Ошибка установки имени конфигурации:', error);
    return false;
  }
};
