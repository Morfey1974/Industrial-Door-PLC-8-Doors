/**
 * DoorsConfig страница - настройка дверей
 * 
 * Реализует:
 * - Два режима: список конфигураций и редактирование
 * - Вкладки: Общие параметры, Двери, Зависимости, Таймауты
 * - Автосохранение в LocalStorage
 * - Экспорт/импорт JSON
 * - Валидацию конфигурации
 * - Применение конфигурации на контроллер
 */

import { useState, useEffect, useCallback } from 'react';
import { getConfigFull, putConfigFull, putConfigTest } from '../../services/api';
import { 
  saveDraft, 
  loadDraft, 
  clearDraft, 
  getSavedConfigsList, 
  saveNamedConfig, 
  loadNamedConfig, 
  deleteNamedConfig,
  exportConfigToFile,
  importConfigFromFile,
  getCurrentConfigName,
  setCurrentConfigName
} from '../../utils/configStorage';
import { validateConfig } from '../../utils/configValidator';
import Button from '../../components/common/Button';
import './DoorsConfig.css';

// Компоненты вкладок
import GeneralTab from './DoorsConfigTabs/GeneralTab';
import DoorsTab from './DoorsConfigTabs/DoorsTab';
import DependenciesTab from './DoorsConfigTabs/DependenciesTab';
import TimeoutsTab from './DoorsConfigTabs/TimeoutsTab';

const DoorsConfig = () => {
  // Режим отображения: 'list' - список конфигураций, 'edit' - редактирование
  const [viewMode, setViewMode] = useState('list');
  
  // Состояние конфигурации
  const [config, setConfig] = useState({
    formatVersion: 0x00010001,
    seq: 0,
    projectName: '',
    openTimeoutMs: 30000,
    doors: [],
    edges: [],
    postCloseTimeouts: [],
    net: {
      dhcpEnabled: 1,
      webPort: 8080,
    },
  });
  
  // Состояние UI
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [savedConfigsList, setSavedConfigsList] = useState([]);
  const [currentConfigName, setCurrentConfigNameState] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [hasDraft, setHasDraft] = useState(false); // Есть ли несохраненный черновик
  
  // Загрузка конфигурации с сервера
  const loadConfigFromServer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const serverConfig = await getConfigFull();
      
      // Преобразуем формат с сервера в наш внутренний формат
      const transformedConfig = {
        formatVersion: serverConfig.formatVersion || 0x00010001,
        seq: serverConfig.seq || 0,
        projectName: serverConfig.projectName || '',
        openTimeoutMs: serverConfig.openTimeoutMs || 30000,
        doors: serverConfig.doors || [],
        edges: serverConfig.edges || [],
        postCloseTimeouts: serverConfig.postCloseTimeouts || [],
        net: serverConfig.net || { dhcpEnabled: 1, webPort: 8080 },
      };
      
      setConfig(transformedConfig);
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      setHasDraft(false);
      
      return transformedConfig;
    } catch (err) {
      console.error('Ошибка загрузки конфигурации:', err);
      setError(`Ошибка загрузки: ${err.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Загрузка при монтировании компонента
  useEffect(() => {
    // Загружаем список сохраненных конфигураций
    setSavedConfigsList(getSavedConfigsList());
    setCurrentConfigNameState(getCurrentConfigName());
    
    // Проверяем наличие черновика
    const draft = loadDraft();
    if (draft && (draft.projectName || draft.doors?.length > 0)) {
      setHasDraft(true);
    } else {
      setHasDraft(false);
    }
  }, []);
  
  // Автосохранение при изменении конфигурации (только в режиме редактирования)
  useEffect(() => {
    if (viewMode === 'edit' && hasUnsavedChanges && (config.projectName || config.doors.length > 0)) {
      saveDraft(config);
      setLastSaved(new Date());
      setHasDraft(true);
    }
  }, [config, hasUnsavedChanges, viewMode]);
  
  // Обновление конфигурации
  const updateConfig = useCallback((updates) => {
    setConfig(prev => ({ ...prev, ...updates }));
    setHasUnsavedChanges(true);
  }, []);
  
  // Валидация конфигурации
  const validateCurrentConfig = useCallback(() => {
    return validateConfig(config);
  }, [config]);
  
  // Создание новой конфигурации
  const handleCreateConfig = useCallback(() => {
    setConfig({
      formatVersion: 0x00010001,
      seq: 0,
      projectName: '',
      openTimeoutMs: 30000,
      doors: [],
      edges: [],
      postCloseTimeouts: [],
      net: {
        dhcpEnabled: 1,
        webPort: 8080,
      },
    });
    setCurrentConfigNameState(null);
    setCurrentConfigName(null);
    setHasUnsavedChanges(false);
    setHasDraft(false);
    clearDraft();
    setViewMode('edit');
    setActiveTab('general');
  }, []);
  
  // Загрузка черновика
  const handleLoadDraft = useCallback(() => {
    const draft = loadDraft();
    if (draft) {
      setConfig(draft);
      setLastSaved(new Date(draft.timestamp));
      setHasUnsavedChanges(true);
      setHasDraft(true);
      setCurrentConfigNameState(null);
      setCurrentConfigName(null);
      setViewMode('edit');
      setActiveTab('general');
    }
  }, []);
  
  // Сохранение черновика как именованной конфигурации
  const handleSaveDraft = useCallback(() => {
    const name = window.prompt('Введите имя конфигурации:');
    if (!name || name.trim().length === 0) return;
    
    const trimmedName = name.trim();
    if (saveNamedConfig(trimmedName, config)) {
      setSavedConfigsList(getSavedConfigsList());
      setCurrentConfigNameState(trimmedName);
      setCurrentConfigName(trimmedName);
      setHasUnsavedChanges(false);
      setHasDraft(false);
      clearDraft();
      setSuccess(`Конфигурация "${trimmedName}" сохранена`);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError('Ошибка сохранения конфигурации');
    }
  }, [config]);
  
  // Загрузка именованной конфигурации
  const handleLoadConfig = useCallback((name) => {
    const loadedConfig = loadNamedConfig(name);
    if (loadedConfig) {
      setConfig(loadedConfig);
      setCurrentConfigNameState(name);
      setCurrentConfigName(name);
      setHasUnsavedChanges(false);
      setHasDraft(false);
      clearDraft();
      setViewMode('edit');
      setActiveTab('general');
      setSuccess(`Конфигурация "${name}" загружена`);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(`Ошибка загрузки конфигурации "${name}"`);
    }
  }, []);
  
  // Удаление именованной конфигурации
  const handleDeleteConfig = useCallback((name) => {
    if (window.confirm(`Удалить конфигурацию "${name}"?`)) {
      if (deleteNamedConfig(name)) {
        setSavedConfigsList(getSavedConfigsList());
        if (currentConfigName === name) {
          setCurrentConfigNameState(null);
          setCurrentConfigName(null);
        }
        setSuccess(`Конфигурация "${name}" удалена`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError('Ошибка удаления конфигурации');
      }
    }
  }, [currentConfigName]);
  
  // Сохранение конфигурации (без выхода)
  const handleSaveConfig = useCallback(() => {
    if (!currentConfigName) {
      // Если конфигурация не имеет имени, предлагаем сохранить как
      handleSaveAs();
      return;
    }
    
    // Валидация перед сохранением
    const validation = validateCurrentConfig();
    if (!validation.valid) {
      setError(`Ошибки валидации: ${validation.errors.join(', ')}`);
      return;
    }
    
    if (saveNamedConfig(currentConfigName, config)) {
      setSavedConfigsList(getSavedConfigsList());
      setHasUnsavedChanges(false);
      setHasDraft(false);
      clearDraft();
      setSuccess(`Конфигурация "${currentConfigName}" сохранена`);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError('Ошибка сохранения конфигурации');
    }
  }, [config, currentConfigName, validateCurrentConfig]);
  
  // Сохранение конфигурации и выход в список
  const handleSaveAndExit = useCallback(() => {
    if (!currentConfigName) {
      // Если конфигурация не имеет имени, предлагаем сохранить как
      const name = window.prompt('Введите имя конфигурации:');
      if (!name || name.trim().length === 0) return;
      
      const trimmedName = name.trim();
      if (!saveNamedConfig(trimmedName, config)) {
        setError('Ошибка сохранения конфигурации');
        return;
      }
      setCurrentConfigNameState(trimmedName);
      setCurrentConfigName(trimmedName);
    } else {
      // Валидация перед сохранением
      const validation = validateCurrentConfig();
      if (!validation.valid) {
        setError(`Ошибки валидации: ${validation.errors.join(', ')}`);
        return;
      }
      
      if (!saveNamedConfig(currentConfigName, config)) {
        setError('Ошибка сохранения конфигурации');
        return;
      }
    }
    
    setSavedConfigsList(getSavedConfigsList());
    setHasUnsavedChanges(false);
    setHasDraft(false);
    clearDraft();
    setViewMode('list');
    setSuccess(`Конфигурация "${currentConfigName || 'новая'}" сохранена`);
    setTimeout(() => setSuccess(null), 3000);
  }, [config, currentConfigName, validateCurrentConfig]);
  
  // Сохранение как (с другим именем)
  const handleSaveAs = useCallback(() => {
    const name = window.prompt('Введите имя конфигурации:');
    if (!name || name.trim().length === 0) return;
    
    const trimmedName = name.trim();
    
    // Валидация перед сохранением
    const validation = validateCurrentConfig();
    if (!validation.valid) {
      setError(`Ошибки валидации: ${validation.errors.join(', ')}`);
      return;
    }
    
    if (saveNamedConfig(trimmedName, config)) {
      setSavedConfigsList(getSavedConfigsList());
      setCurrentConfigNameState(trimmedName);
      setCurrentConfigName(trimmedName);
      setHasUnsavedChanges(false);
      setHasDraft(false);
      clearDraft();
      setSuccess(`Конфигурация "${trimmedName}" сохранена`);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError('Ошибка сохранения конфигурации');
    }
  }, [config, validateCurrentConfig]);
  
  // Экспорт конфигурации
  const handleExport = useCallback(() => {
    const filename = config.projectName 
      ? `config_${config.projectName.replace(/[^a-zA-Z0-9]/g, '_')}.json`
      : 'config.json';
    if (exportConfigToFile(config, filename)) {
      setSuccess('Конфигурация экспортирована');
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError('Ошибка экспорта конфигурации');
    }
  }, [config]);
  
  // Импорт конфигурации
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const importedConfig = await importConfigFromFile(file);
        
        // Валидация импортированной конфигурации
        const validation = validateConfig(importedConfig);
        if (!validation.valid) {
          setError(`Ошибки валидации: ${validation.errors.join(', ')}`);
          return;
        }
        
        setConfig(importedConfig);
        setCurrentConfigNameState(null);
        setCurrentConfigName(null);
        setHasUnsavedChanges(true);
        setHasDraft(true);
        setViewMode('edit');
        setActiveTab('general');
        setSuccess('Конфигурация импортирована');
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        setError(`Ошибка импорта: ${err.message}`);
      }
    };
    input.click();
  }, []);
  
  // Загрузка конфигурации с контроллера
  const handleLoadFromController = useCallback(async () => {
    const loadedConfig = await loadConfigFromServer();
    if (loadedConfig) {
      setCurrentConfigNameState(null);
      setCurrentConfigName(null);
      setHasUnsavedChanges(false);
      setHasDraft(false);
      clearDraft();
      setViewMode('edit');
      setActiveTab('general');
      setSuccess('Конфигурация загружена с контроллера');
      setTimeout(() => setSuccess(null), 3000);
    }
  }, [loadConfigFromServer]);
  
  // Применение конфигурации на контроллер (PUT /api/config/full)
  const handleApplyToController = useCallback(async () => {
    const validation = validateCurrentConfig();
    if (!validation.valid) {
      setError(`Ошибки валидации: ${validation.errors.join(', ')}`);
      return;
    }

    const doorCount = config.doors?.length ?? 0;
    const edgeCount = config.edges?.length ?? 0;
    const LIMIT_DOORS_V1 = 8;
    const LIMIT_EDGES_V1 = 16;
    const LIMIT_POST_CLOSE_V1 = 8;

    if (doorCount > LIMIT_DOORS_V1) {
      setError(`В первой версии поддерживается не более ${LIMIT_DOORS_V1} дверей. Сейчас: ${doorCount}. Удалите лишние двери или сохраните конфигурацию и примените другую.`);
      return;
    }
    if (edgeCount > LIMIT_EDGES_V1) {
      setError(`В первой версии поддерживается не более ${LIMIT_EDGES_V1} зависимостей. Сейчас: ${edgeCount}.`);
      return;
    }
    const pctCount = config.postCloseTimeouts?.length ?? 0;
    if (pctCount > LIMIT_POST_CLOSE_V1) {
      setError(`В первой версии поддерживается не более ${LIMIT_POST_CLOSE_V1} записей postCloseTimeouts. Сейчас: ${pctCount}.`);
      return;
    }

    let confirmMessage = 'Применить полную конфигурацию на контроллер?\n\n';
    confirmMessage += `Будут применены: название проекта, таймаут открытия, двери (${doorCount}), зависимости (${edgeCount}), таймауты post-close.\n`;
    confirmMessage += `Лимит v1: не более ${LIMIT_DOORS_V1} дверей.\n\n`;
    confirmMessage += 'Это заменит текущую конфигурацию на контроллере. Запись в Flash может занять до 90 секунд.';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess('Применение конфигурации... Это может занять до 90 секунд (стирание и запись в Flash).');

    try {
      if (!config.projectName || config.projectName.trim().length === 0) {
        setError('Название проекта не может быть пустым');
        setSaving(false);
        return;
      }
      if (config.openTimeoutMs < 1000 || config.openTimeoutMs > 3600000) {
        setError('Таймаут открытия должен быть от 1000 до 3600000 мс');
        setSaving(false);
        return;
      }

      const trimmedProjectName = config.projectName.trim();
      if (trimmedProjectName.length > 32) {
        setError('Название проекта не может быть длиннее 32 символов');
        setSaving(false);
        return;
      }

      const doors = (config.doors || []).map((d) => ({
        techId: d.techId,
        drawingId: d.drawingId ?? 0,
        nodeId: d.nodeId,
        localDoor: d.localDoor,
        globalDoorId: d.globalDoorId ?? ((d.nodeId - 1) * 8 + d.localDoor),
        type: d.type === 'NO' ? 'NO' : d.type === 'CARD_READER' ? 'CARD_READER' : 'NC',
        typeCode: d.typeCode ?? (d.type === 'NO' ? 1 : d.type === 'CARD_READER' ? 2 : 0),
        comment: d.comment ?? '',
      }));

      const fullConfig = {
        projectName: trimmedProjectName,
        openTimeoutMs: config.openTimeoutMs,
        doors,
        edges: config.edges || [],
        postCloseTimeouts: config.postCloseTimeouts || [],
        net: config.net || { dhcpEnabled: 1, webPort: 8080 },
      };

      const jsonString = JSON.stringify(fullConfig);
      const jsonSize = new Blob([jsonString]).size;
      if (jsonSize > 2048) {
        setError(`Размер данных слишком большой: ${jsonSize} байт (максимум 2048). Уменьшите число дверей или длины комментариев.`);
        setSaving(false);
        return;
      }

      console.log('[DoorsConfig] PUT /api/config/full:', { doors: doors.length, edges: fullConfig.edges.length, postCloseTimeouts: fullConfig.postCloseTimeouts.length, jsonSize });
      const response = await putConfigFull(fullConfig);
      console.log('Ответ от контроллера:', response);

      if (response && response.ok === 0) {
        const errorMsg = response.error || response.errorMsg || 'Неизвестная ошибка сервера';
        setError(`Ошибка сервера: ${errorMsg}`);
        setSaving(false);
        return;
      }

      clearDraft();
      setHasUnsavedChanges(false);
      setHasDraft(false);

      setSuccess('✅ Полная конфигурация успешно применена на контроллер (двери, зависимости, таймауты).');
      setTimeout(() => setSuccess(null), 7000);
    } catch (err) {
      console.error('Ошибка применения конфигурации:', err);
      console.error('Детали ошибки:', {
        response: err.response?.data,
        status: err.response?.status,
        statusText: err.response?.statusText,
        headers: err.response?.headers,
        message: err.message,
        code: err.code,
        request: err.request,
      });
      
      // Дополнительное логирование для отладки
      if (err.response) {
        console.error('Тело ответа сервера (raw):', err.response.data);
        if (typeof err.response.data === 'string') {
          try {
            const parsed = JSON.parse(err.response.data);
            console.error('Тело ответа сервера (parsed):', parsed);
          } catch (e) {
            console.error('Не удалось распарсить ответ как JSON');
          }
        }
      }
      
      // Улучшенная обработка ошибок
      let errorMessage = 'Ошибка применения конфигурации';
      
      if (err.response) {
        // Сервер вернул ошибку
        const status = err.response.status;
        const data = err.response.data;
        
        if (status === 400) {
          // Ошибка валидации - показываем детали из ответа сервера
          const statusText = err.response?.statusText || '';
          
          // Проверяем специальные случаи ошибок сервера
          if (statusText.includes('Bad Headers') || (typeof data === 'string' && data.includes('Bad Headers'))) {
            errorMessage = 'Ошибка обработки заголовков запроса на сервере. Возможно, запрос слишком большой или поврежден. Попробуйте еще раз.';
          } else if (statusText.includes('Bad Body') || (typeof data === 'string' && data.includes('Bad Body'))) {
            errorMessage = 'Ошибка обработки тела запроса на сервере. Возможно, данные повреждены. Попробуйте еще раз.';
          } else if (data && typeof data === 'object') {
            if (data.error) {
              errorMessage = `Ошибка валидации: ${data.error}`;
            } else if (data.errorMsg) {
              errorMessage = `Ошибка валидации: ${data.errorMsg}`;
            } else {
              errorMessage = 'Ошибка валидации данных на сервере. Проверьте корректность конфигурации.';
            }
          } else if (typeof data === 'string') {
            if (data.includes('error')) {
              // Попытка извлечь сообщение об ошибке из строки
              try {
                const parsed = JSON.parse(data);
                if (parsed.error || parsed.errorMsg) {
                  errorMessage = `Ошибка валидации: ${parsed.error || parsed.errorMsg}`;
                } else {
                  errorMessage = `Ошибка сервера: ${data}`;
                }
              } catch (e) {
                errorMessage = `Ошибка сервера: ${data}`;
              }
            } else {
              errorMessage = `Ошибка сервера: ${data}`;
            }
          } else {
            errorMessage = 'Ошибка валидации данных на сервере. Проверьте корректность конфигурации.';
          }
        } else if (status === 500) {
          errorMessage = 'Внутренняя ошибка сервера. Проверьте логи контроллера.';
        } else {
          errorMessage = `Ошибка сервера (код ${status})`;
          if (data && data.error) {
            errorMessage += `: ${data.error}`;
          }
        }
      } else if (err.request) {
        // Запрос отправлен, но ответа нет
        if (err.code === 'ERR_CONNECTION_RESET') {
          errorMessage = 'Соединение с контроллером разорвано. Возможно, контроллер перегружен или перезагружается.';
        } else if (err.code === 'ERR_NETWORK') {
          errorMessage = 'Ошибка сети. Проверьте подключение к контроллеру.';
        } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout') || err.message?.includes('таймаут')) {
          errorMessage = 'Превышено время ожидания ответа от сервера (90 секунд). Операция стирания и записи в Flash память может занимать 15-20 секунд. Если ошибка повторяется, проверьте состояние контроллера через UART и убедитесь, что Flash память не повреждена.';
        } else {
          errorMessage = 'Нет ответа от контроллера. Проверьте подключение к сети и доступность контроллера.';
        }
      } else {
        // Ошибка при настройке запроса
        // Проверяем, не является ли это ошибкой таймаута
        if (err.code === 'ECONNABORTED' || err.message?.includes('timeout') || err.message?.includes('таймаут') || err.message?.includes('Превышено время ожидания')) {
          errorMessage = 'Превышено время ожидания ответа от сервера (90 секунд). Операция стирания и записи в Flash память может занимать 15-20 секунд. Если ошибка повторяется, проверьте состояние контроллера через UART и убедитесь, что Flash память не повреждена.';
        } else {
          errorMessage = err.message || 'Ошибка при отправке запроса';
        }
      }
      
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  }, [config, validateCurrentConfig]);
  
  // Тестовая запись 1 байта в Flash для диагностики
  const handleTestFlash = useCallback(async () => {
    if (!window.confirm('Выполнить тестовую запись 1 байта в Flash?\n\n' +
                        'Это запишет тестовый байт по адресу 0xFEFFFF (последний байт слота A конфигурации).\n' +
                        'Операция включает стирание сектора и запись 1 байта.\n\n' +
                        'Проверьте результат в UART мониторе.')) {
      return;
    }
    
    setSaving(true);
    setError(null);
    setSuccess('Тестовая запись в Flash... Это может занять до 30 секунд');
    
    try {
      // Генерируем случайное значение для теста (0-255)
      const testValue = Math.floor(Math.random() * 256);
      
      console.log('Тестовая запись в Flash:', {
        address: '0xFEFFFF',
        value: `0x${testValue.toString(16).padStart(2, '0').toUpperCase()}`,
        decimal: testValue,
      });
      
      const result = await putConfigTest(testValue);
      
      if (result.ok) {
        setSuccess(`✅ Тестовая запись успешна!\n` +
                   `Адрес: ${result.address}\n` +
                   `Старое значение: 0x${result.oldValue.toString(16).padStart(2, '0').toUpperCase()} (${result.oldValue})\n` +
                   `Записано: 0x${result.writtenValue.toString(16).padStart(2, '0').toUpperCase()} (${result.writtenValue})\n` +
                   `Проверено: 0x${result.verifiedValue.toString(16).padStart(2, '0').toUpperCase()} (${result.verifiedValue})\n\n` +
                   `Проверьте UART монитор для деталей.`);
        setTimeout(() => setSuccess(null), 10000);
      } else {
        setError(`❌ Тестовая запись не удалась: ${result.error || 'неизвестная ошибка'}`);
      }
    } catch (err) {
      console.error('Ошибка тестовой записи:', err);
      let errorMessage = 'Ошибка при тестовой записи в Flash';
      
      if (err.response?.data) {
        const data = err.response.data;
        if (data.error) {
          errorMessage = `Ошибка: ${data.error}`;
        } else if (data.errorMsg) {
          errorMessage = `Ошибка: ${data.errorMsg}`;
        }
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        errorMessage = 'Превышено время ожидания (30 секунд). Проверьте UART монитор для диагностики.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  }, []);
  
  const tabs = [
    { id: 'general', label: 'Общие параметры' },
    { id: 'doors', label: 'Двери' },
    { id: 'dependencies', label: 'Зависимости' },
    { id: 'timeouts', label: 'Таймауты' },
  ];
  
  // Режим списка конфигураций
  if (viewMode === 'list') {
    return (
      <div className="doors-config">
        <div className="doors-config-header">
          <h1>Конфигурация → Настройка дверей</h1>
        </div>
        
        {/* Панель управления (только в режиме списка) */}
        <div className="doors-config-toolbar">
          <div className="toolbar-left">
            <Button onClick={loadConfigFromServer} disabled={loading}>
              {loading ? 'Загрузка...' : '📥 Загрузить с сервера'}
            </Button>
            <Button onClick={handleExport} variant="secondary">
              📤 Экспорт
            </Button>
            <Button onClick={handleImport} variant="secondary">
              📥 Импорт
            </Button>
          </div>
        </div>
        
        {/* Сообщения об ошибках и успехе */}
        {error && (
          <div className="alert alert-error">
            ⚠️ {error}
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}
        {success && (
          <div className="alert alert-success">
            ✅ {success}
            <button onClick={() => setSuccess(null)}>✕</button>
          </div>
        )}
        
        {/* Список сохраненных конфигураций */}
        <div className="saved-configs-list">
          <h3>Сохраненные конфигурации:</h3>
          
          {/* Несохраненная конфигурация (черновик) */}
          {hasDraft && (
            <div className="saved-configs-grid">
              <div className="saved-config-item unsaved-config">
                <div className="saved-config-info">
                  <strong>Несохраненная конфигурация</strong>
                  <span className="saved-config-date">
                    {lastSaved ? `Изменено: ${lastSaved.toLocaleString()}` : 'Черновик'}
                  </span>
                </div>
                <div className="saved-config-actions">
                  <Button 
                    onClick={handleLoadDraft}
                    variant="secondary"
                    size="small"
                  >
                    Загрузить
                  </Button>
                  <Button 
                    onClick={handleSaveDraft}
                    variant="primary"
                    size="small"
                  >
                    Сохранить
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          {/* Сохраненные конфигурации */}
          {savedConfigsList.length > 0 && (
            <div className="saved-configs-grid">
              {savedConfigsList.map((item) => (
                <div key={item.name} className="saved-config-item">
                  <div className="saved-config-info">
                    <strong>{item.name}</strong>
                    <span>{item.doorCount} дверей</span>
                    <span className="saved-config-date">
                      {new Date(item.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="saved-config-actions">
                    <Button 
                      onClick={() => handleLoadConfig(item.name)}
                      variant="secondary"
                      size="small"
                    >
                      Загрузить
                    </Button>
                    <Button 
                      onClick={() => handleDeleteConfig(item.name)}
                      variant="secondary"
                      size="small"
                    >
                      Удалить
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Кнопка создания конфигурации (если нет конфигураций) */}
          {savedConfigsList.length === 0 && !hasDraft && (
            <div className="empty-state">
              <p>Нет сохраненных конфигураций</p>
              <Button onClick={handleCreateConfig} variant="primary">
                ➕ Создать конфигурацию
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }
  
  // Режим редактирования
  return (
    <div className="doors-config">
      <div className="doors-config-header">
        <h1>Конфигурация → Настройка дверей</h1>
        <div className="doors-config-status">
          {hasUnsavedChanges && lastSaved && (
            <span className="auto-save-indicator">
              💾 Автосохранено: {lastSaved.toLocaleTimeString()} (черновик)
            </span>
          )}
          {!hasUnsavedChanges && currentConfigName && (
            <span className="auto-save-indicator" style={{ color: '#3c3' }}>
              ✓ Конфигурация "{currentConfigName}" сохранена
            </span>
          )}
        </div>
      </div>
      
      {/* Панель управления (в режиме редактирования) */}
      <div className="doors-config-toolbar">
        <div className="toolbar-left">
          <Button onClick={handleLoadFromController} disabled={loading}>
            {loading ? 'Загрузка...' : '📥 Загрузить с контроллера'}
          </Button>
          <Button onClick={handleExport} variant="secondary">
            📤 Экспорт
          </Button>
          <Button onClick={handleImport} variant="secondary">
            📥 Импорт
          </Button>
        </div>
        <div className="toolbar-right">
          <Button 
            onClick={handleTestFlash} 
            variant="secondary"
            disabled={saving || loading}
            title="Тестовая запись 1 байта в Flash для диагностики пути UI -> HTTP -> Flash"
          >
            {saving ? 'Тест...' : '🧪 TEST'}
          </Button>
          <Button 
            onClick={handleApplyToController} 
            variant="primary"
            disabled={saving || loading}
          >
            {saving ? 'Применение...' : '📤 Применить на контроллер'}
          </Button>
        </div>
      </div>
      
      {/* Сообщения об ошибках и успехе */}
      {error && (
        <div className="alert alert-error">
          ⚠️ {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
      {success && (
        <div className="alert alert-success">
          ✅ {success}
          <button onClick={() => setSuccess(null)}>✕</button>
        </div>
      )}
      
      {/* Вкладки с кнопками сохранения */}
      <div className="doors-config-tabs">
        <div className="tabs-header-with-actions">
          <div className="tabs-header">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="tabs-actions">
            <Button onClick={handleSaveConfig} variant="secondary" size="small">
              💾 Сохранить конфигурацию
            </Button>
            <Button onClick={handleSaveAs} variant="secondary" size="small">
              💾 Сохранить как...
            </Button>
            <Button onClick={handleSaveAndExit} variant="primary" size="small">
              💾 Сохранить и Выйти
            </Button>
          </div>
        </div>
        
        <div className="tabs-content">
          {activeTab === 'general' && (
            <GeneralTab 
              config={config} 
              updateConfig={updateConfig}
              loading={loading}
            />
          )}
          {activeTab === 'doors' && (
            <DoorsTab 
              config={config} 
              updateConfig={updateConfig}
              loading={loading}
            />
          )}
          {activeTab === 'dependencies' && (
            <DependenciesTab 
              config={config} 
              updateConfig={updateConfig}
              loading={loading}
            />
          )}
          {activeTab === 'timeouts' && (
            <TimeoutsTab 
              config={config} 
              updateConfig={updateConfig}
              loading={loading}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default DoorsConfig;
