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

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { getConfigFull, putConfigFull } from '../../services/api';
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
import Modal from '../../components/common/Modal';
import './DoorsConfig.css';

// Компоненты вкладок
import GeneralTab from './DoorsConfigTabs/GeneralTab';
import DoorsTab from './DoorsConfigTabs/DoorsTab';
import DependenciesTab from './DoorsConfigTabs/DependenciesTab';
import TimeoutsTab from './DoorsConfigTabs/TimeoutsTab';

const DoorsConfig = () => {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [openedConfigFilePath, setOpenedConfigFilePath] = useState(null); // путь/имя файла при открытии с компьютера
  
  // Состояние модального окна
  const [modal, setModal] = useState({
    isOpen: false,
    type: 'confirm', // 'confirm' | 'prompt'
    title: '',
    message: '',
    defaultValue: '',
    placeholder: '',
    confirmText: 'OK',
    cancelText: 'Отмена',
    onConfirm: null,
    onCancel: null,
  });
  

  // Ref для хранения resolve функции Promise
  const modalResolveRef = useRef(null);
  // Ref для хранения имени конфигурации для удаления
  const deleteConfigNameRef = useRef(null);
  
  // Отдельное состояние для модального окна удаления (простое булево значение для flushSync)
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteModalName, setDeleteModalName] = useState(null);
  const [deleteModalForDraft, setDeleteModalForDraft] = useState(false);
  
  // useLayoutEffect для принудительного обновления DOM при открытии модального окна удаления
  useLayoutEffect(() => {
    if (deleteModalVisible) {
      // Принудительно обновляем DOM после открытия модального окна
      // Это гарантирует, что модальное окно появится сразу
      requestAnimationFrame(() => {
        const modalElement = document.querySelector('.modal-overlay');
        if (modalElement) {
          // Триггерим перерисовку
          modalElement.offsetHeight;
        }
      });
    }
  }, [deleteModalVisible]);

  // useLayoutEffect для принудительного обновления DOM при открытии модального окна
  useLayoutEffect(() => {
    if (modal.isOpen) {
      // Принудительно обновляем DOM после открытия модального окна
      // Это гарантирует, что модальное окно появится сразу
      const modalElement = document.querySelector('.modal-overlay');
      if (modalElement) {
        // Триггерим перерисовку
        modalElement.offsetHeight;
      }
    }
  }, [modal.isOpen]);

  // Функции для показа модальных окон
  const showConfirm = useCallback((message, title = 'Подтвердите действие') => {
    return new Promise((resolve) => {
      // Сохраняем resolve функцию в ref
      modalResolveRef.current = resolve;
      
      // Используем flushSync для принудительного синхронного обновления DOM
      // ВАЖНО: flushSync должен быть вызван синхронно, до возврата Promise
      flushSync(() => {
        setModal({
          isOpen: true,
          type: 'confirm',
          title,
          message,
          confirmText: 'Да',
          cancelText: 'Нет',
          onConfirm: () => {
            setModal(prev => ({ ...prev, isOpen: false }));
            if (modalResolveRef.current) {
              modalResolveRef.current(true);
              modalResolveRef.current = null;
            }
          },
          onCancel: () => {
            setModal(prev => ({ ...prev, isOpen: false }));
            if (modalResolveRef.current) {
              modalResolveRef.current(false);
              modalResolveRef.current = null;
            }
          },
        });
      });
    });
  }, []);

  const showPrompt = useCallback((message, defaultValue = '', title = 'Введите значение', placeholder = '') => {
    return new Promise((resolve) => {
      // Сохраняем resolve функцию в ref
      modalResolveRef.current = resolve;
      
      // Используем flushSync для принудительного синхронного обновления DOM
      // Это гарантирует, что модальное окно появится сразу
      flushSync(() => {
        setModal({
          isOpen: true,
          type: 'prompt',
          title,
          message,
          defaultValue,
          placeholder,
          confirmText: 'OK',
          cancelText: 'Отмена',
          onConfirm: (value) => {
            setModal(prev => ({ ...prev, isOpen: false }));
            if (modalResolveRef.current) {
              modalResolveRef.current(value);
              modalResolveRef.current = null;
            }
          },
          onCancel: () => {
            setModal(prev => ({ ...prev, isOpen: false }));
            if (modalResolveRef.current) {
              modalResolveRef.current(null);
              modalResolveRef.current = null;
            }
          },
        });
      });
    });
  }, []);
  
  // Загрузка конфигурации с сервера
  const loadConfigFromServer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const serverConfig = await getConfigFull();
      
      // Проверка структуры ответа
      if (!serverConfig || typeof serverConfig !== 'object') {
        throw new Error('Некорректный формат ответа от сервера');
      }
      
      // Преобразуем формат с сервера в наш внутренний формат
      const doors = Array.isArray(serverConfig.doors) ? serverConfig.doors : [];
      const edges = Array.isArray(serverConfig.edges) ? serverConfig.edges : [];
      const postCloseTimeoutsRaw = Array.isArray(serverConfig.postCloseTimeouts) 
        ? serverConfig.postCloseTimeouts 
        : [];
      
      // Нормализация postCloseTimeouts: фильтруем дефолтные значения (500ms на сервере = 0 в UI)
      // В UI храним только таймауты, которые отличаются от дефолтного (0ms)
      const DEFAULT_POST_CLOSE_TIMEOUT_MS = 500; // Дефолтное значение на сервере
      const postCloseTimeouts = postCloseTimeoutsRaw
        .filter(t => t && t.timeoutMs !== undefined && t.timeoutMs !== null && t.timeoutMs !== DEFAULT_POST_CLOSE_TIMEOUT_MS && t.timeoutMs !== 0)
        .map(t => ({
          globalDoorId: t.globalDoorId,
          timeoutMs: t.timeoutMs,
        }));
      
      const transformedConfig = {
        formatVersion: serverConfig.formatVersion || 0x00010001,
        seq: serverConfig.seq || 0,
        projectName: serverConfig.projectName || '',
        openTimeoutMs: serverConfig.openTimeoutMs || 30000,
        doors: doors,
        edges: edges,
        postCloseTimeouts: postCloseTimeouts,
        net: serverConfig.net || { dhcpEnabled: 1, webPort: 8080 },
      };
      
      // Валидация загруженных данных (мягкая - только критические ошибки)
      // При загрузке с сервера пустое projectName - это нормально, пользователь может заполнить его позже
      const validation = validateConfig(transformedConfig);
      if (!validation.valid) {
        // Фильтруем некритические ошибки при загрузке (пустое projectName - не критично)
        const criticalErrors = validation.errors.filter(err => 
          !err.includes('Название проекта не может быть пустым')
        );
        
        if (criticalErrors.length > 0) {
          console.warn('Загруженная конфигурация имеет критические ошибки валидации:', criticalErrors);
          // Показываем только критические ошибки
          setError(`Внимание: загруженная конфигурация содержит ошибки: ${criticalErrors.join(', ')}. Проверьте данные перед применением.`);
        } else {
          // Если только некритические ошибки (пустое projectName) - просто логируем
          console.info('Загруженная конфигурация: projectName пустое (это нормально, можно заполнить позже)');
        }
      }
      
      setConfig(transformedConfig);
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      setHasDraft(false);
      
      return transformedConfig;
    } catch (err) {
      console.error('Ошибка загрузки конфигурации:', err);
      
      // Улучшенная обработка ошибок
      let errorMessage = 'Ошибка загрузки конфигурации';
      
      if (err.response) {
        // Ошибка от сервера
        const status = err.response.status;
        if (status === 404) {
          errorMessage = 'Endpoint /api/config/full не найден. Убедитесь, что прошивка поддерживает этот endpoint.';
        } else if (status === 500) {
          errorMessage = 'Внутренняя ошибка сервера при загрузке конфигурации. Проверьте логи контроллера.';
        } else if (status >= 400 && status < 500) {
          errorMessage = `Ошибка клиента (${status}). Проверьте запрос.`;
        } else {
          errorMessage = `Ошибка сервера (${status})`;
        }
      } else if (err.request) {
        // Запрос отправлен, но ответа нет
        if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
          errorMessage = 'Превышено время ожидания ответа от контроллера. Проверьте подключение к сети.';
        } else if (err.code === 'ERR_CONNECTION_RESET') {
          errorMessage = 'Соединение с контроллером разорвано. Проверьте подключение и перезагрузите страницу.';
        } else if (err.code === 'ERR_NETWORK') {
          errorMessage = 'Ошибка сети. Проверьте подключение к контроллеру.';
        } else {
          errorMessage = 'Нет ответа от контроллера. Проверьте подключение к сети и доступность контроллера.';
        }
      } else if (err.message) {
        // Ошибка при настройке запроса или другая ошибка
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Загрузка при монтировании компонента
  useEffect(() => {
    // Загружаем список сохраненных конфигураций
    const configs = getSavedConfigsList();
    console.log('[DoorsConfig] Загружен список конфигураций:', configs);
    setSavedConfigsList(configs);
    setCurrentConfigNameState(getCurrentConfigName());
    
    // Проверяем наличие черновика
    const draft = loadDraft();
    if (draft && (draft.projectName || draft.doors?.length > 0)) {
      setHasDraft(true);
    } else {
      setHasDraft(false);
    }
  }, []);

  // Возврат из маппинга: открыть редактор той конфигурации, в которой работали
  useEffect(() => {
    const openConfigName = location.state?.openConfigName;
    if (!openConfigName) return;
    const loadedConfig = loadNamedConfig(openConfigName);
    if (loadedConfig) {
      setConfig(loadedConfig);
      setCurrentConfigNameState(openConfigName);
      setCurrentConfigName(openConfigName);
      setHasUnsavedChanges(false);
      setHasDraft(false);
      clearDraft();
      setViewMode('edit');
      setActiveTab('general');
    }
    navigate('/configuration/doors', { replace: true, state: {} });
  }, [location.state?.openConfigName, navigate]);
  
  // Автосохранение при изменении конфигурации (только в режиме редактирования)
  useEffect(() => {
    if (viewMode === 'edit' && hasUnsavedChanges && (config.projectName || config.doors.length > 0)) {
      saveDraft(config);
      setLastSaved(new Date());
      setHasDraft(true);
    }
  }, [config, hasUnsavedChanges, viewMode]);

  // Автоскрытие сообщения об ошибке через 3 с (как у success)
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(t);
  }, [error]);
  
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
    setOpenedConfigFilePath(null);
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
      setOpenedConfigFilePath(null);
      setViewMode('edit');
      setActiveTab('general');
    }
  }, []);
  
  // Сохранение черновика как именованной конфигурации
  const handleSaveDraft = useCallback(async () => {
    const name = await showPrompt('Введите имя конфигурации:', '', 'Сохранение конфигурации');
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
  
  // Открыть модальное окно удаления черновика
  const handleDeleteDraftClick = useCallback(() => {
    setDeleteModalForDraft(true);
    setDeleteModalVisible(true);
  }, []);

  const doDeleteDraft = useCallback(() => {
    clearDraft();
    setConfig({
      formatVersion: 0x00010001,
      seq: 0,
      projectName: '',
      openTimeoutMs: 30000,
      doors: [],
      edges: [],
      postCloseTimeouts: [],
      net: { dhcpEnabled: 1, webPort: 8080 },
    });
    setHasDraft(false);
    setHasUnsavedChanges(false);
    setLastSaved(null);
    setCurrentConfigNameState(null);
    setCurrentConfigName(null);
    setOpenedConfigFilePath(null);
    setSuccess('Черновик удалён');
    setTimeout(() => setSuccess(null), 3000);
  }, []);
  
  // Загрузка именованной конфигурации
  const handleLoadConfig = useCallback((name) => {
    const loadedConfig = loadNamedConfig(name);
    if (loadedConfig) {
      setConfig(loadedConfig);
      setCurrentConfigNameState(name);
      setCurrentConfigName(name);
      setOpenedConfigFilePath(null); // из локального хранилища, не из файла
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
    // Сохраняем имя конфигурации для удаления в ref
    deleteConfigNameRef.current = name;
    
    // Используем setTimeout с нулевой задержкой, чтобы обновление произошло в следующем тике
    // Это гарантирует, что модальное окно появится сразу, как в handleLoadConfig
    setTimeout(() => {
      setModal({
        isOpen: true,
        type: 'confirm',
        title: 'Удаление конфигурации',
        message: `Удалить конфигурацию "${name}"?`,
        confirmText: 'Да',
        cancelText: 'Нет',
        onConfirm: () => {
          const configName = deleteConfigNameRef.current;
          setModal(prev => ({ ...prev, isOpen: false }));
          if (configName && deleteNamedConfig(configName)) {
            setSavedConfigsList(getSavedConfigsList());
            if (currentConfigName === configName) {
              setCurrentConfigNameState(null);
              setCurrentConfigName(null);
            }
            setSuccess(`Конфигурация "${configName}" удалена`);
            setTimeout(() => setSuccess(null), 3000);
          } else if (configName) {
            setError('Ошибка удаления конфигурации');
          }
        },
        onCancel: () => {
          setModal(prev => ({ ...prev, isOpen: false }));
        },
      });
    }, 0);
  }, [currentConfigName]);
  
  // Сохранение конфигурации (без выхода)
  const handleSaveConfig = useCallback(async () => {
    if (!currentConfigName && !openedConfigFilePath) {
      // Новая конфигурация — открываем диалог выбора места и сохраняем в файл
      const validation = validateCurrentConfig();
      if (!validation.valid) {
        setError(`Ошибки валидации: ${validation.errors.join(', ')}`);
        return;
      }
      const base = config.projectName || 'config';
      const filename = base.replace(/[^a-zA-Z0-9\u0400-\u04FF]/g, '_') + '_conf.json';
      const result = await exportConfigToFile(config, filename);
      if (!result.ok) {
        if (!result.cancelled) setError('Ошибка сохранения конфигурации');
        return;
      }
      const savedFilename = result.filename || filename;
      const derivedName = savedFilename.replace(/_conf\.json$/i, '') || savedFilename.replace(/\.json$/i, '');
      setOpenedConfigFilePath(savedFilename);
      setCurrentConfigNameState(derivedName);
      setCurrentConfigName(derivedName);
      saveNamedConfig(derivedName, config);
      setSavedConfigsList(getSavedConfigsList());
      setHasUnsavedChanges(false);
      setHasDraft(false);
      clearDraft();
      setSuccess(`Конфигурация сохранена в файл`);
      setTimeout(() => setSuccess(null), 3000);
      return;
    }

    if (!currentConfigName) {
      // Есть openedConfigFilePath, но нет имени — сохраняем в список под именем из файла
      const name = (openedConfigFilePath || '').replace(/_conf\.json$/i, '') || 'config';
      if (saveNamedConfig(name, config)) {
        setSavedConfigsList(getSavedConfigsList());
        setCurrentConfigNameState(name);
        setCurrentConfigName(name);
        setHasUnsavedChanges(false);
        setHasDraft(false);
        clearDraft();
        setSuccess(`Конфигурация "${name}" сохранена`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError('Ошибка сохранения конфигурации');
      }
      return;
    }
    
    // Существующая конфигурация — сохраняем в список
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
  }, [config, currentConfigName, openedConfigFilePath, validateCurrentConfig]);
  
  // Сохранение конфигурации и выход в список
  const handleSaveAndExit = useCallback(async () => {
    let savedName = currentConfigName;
    if (!currentConfigName && !openedConfigFilePath) {
      // Новая конфигурация — открываем диалог и сохраняем в файл, затем выходим
      const validation = validateCurrentConfig();
      if (!validation.valid) {
        setError(`Ошибки валидации: ${validation.errors.join(', ')}`);
        return;
      }
      const base = config.projectName || 'config';
      const filename = base.replace(/[^a-zA-Z0-9\u0400-\u04FF]/g, '_') + '_conf.json';
      const result = await exportConfigToFile(config, filename);
      if (!result.ok) {
        if (!result.cancelled) setError('Ошибка сохранения конфигурации');
        return;
      }
      const savedFilename = result.filename || filename;
      savedName = savedFilename.replace(/_conf\.json$/i, '') || savedFilename.replace(/\.json$/i, '');
      setOpenedConfigFilePath(savedFilename);
      setCurrentConfigNameState(savedName);
      setCurrentConfigName(savedName);
      saveNamedConfig(savedName, config);
    } else if (!currentConfigName) {
      // Есть openedConfigFilePath — сохраняем в список под именем из файла
      savedName = (openedConfigFilePath || '').replace(/_conf\.json$/i, '') || 'config';
      if (!saveNamedConfig(savedName, config)) {
        setError('Ошибка сохранения конфигурации');
        return;
      }
      setCurrentConfigNameState(savedName);
      setCurrentConfigName(savedName);
    } else {
      // Существующая конфигурация
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
    setSuccess(`Конфигурация "${savedName || 'новая'}" сохранена`);
    setTimeout(() => setSuccess(null), 3000);
  }, [config, currentConfigName, openedConfigFilePath, validateCurrentConfig]);
  
  // Сохранение как — окно выбора места сохранения (экспорт в файл)
  const handleSaveAs = useCallback(async () => {
    const validation = validateCurrentConfig();
    if (!validation.valid) {
      setError(`Ошибки валидации: ${validation.errors.join(', ')}`);
      return;
    }

    const base = currentConfigName || config.projectName || 'config';
    const filename = base.replace(/[^a-zA-Z0-9\u0400-\u04FF]/g, '_') + '_conf.json';
    const result = await exportConfigToFile(config, filename);

    if (result.ok) {
      if (result.filename) {
        setOpenedConfigFilePath(result.filename);
      }
      setSuccess('Конфигурация сохранена в файл');
      setTimeout(() => setSuccess(null), 3000);
    } else if (!result.cancelled) {
      setError('Ошибка сохранения конфигурации');
    }
  }, [config, currentConfigName, validateCurrentConfig]);
  
  // Импорт конфигурации (Открыть конфигурацию в списке)
  const handleImport = useCallback(async () => {
    const loadFromFile = async (file) => {
      try {
        const importedConfig = await importConfigFromFile(file);
        const validation = validateConfig(importedConfig);
        if (!validation.valid) {
          setError(`Ошибки валидации: ${validation.errors.join(', ')}`);
          return;
        }
        setConfig(importedConfig);
        setCurrentConfigNameState(null);
        setCurrentConfigName(null);
        // file.path — полный путь в Electron; в браузере — только file.name
        setOpenedConfigFilePath(file.path || file.name || '');
        setHasUnsavedChanges(true);
        setHasDraft(true);
        setViewMode('edit');
        setActiveTab('general');
        setSuccess('Конфигурация открыта');
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        setError(`Ошибка импорта: ${err.message}`);
      }
    };

    if (typeof window.showOpenFilePicker === 'function') {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
          id: 'industrial-door-configs',
          startIn: 'documents',
        });
        const file = await handle.getFile();
        await loadFromFile(file);
      } catch (err) {
        if (err?.name !== 'AbortError') setError(`Ошибка: ${err.message}`);
      }
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await loadFromFile(file);
    };
    input.click();
  }, []);
  
  // Загрузка конфигурации с контроллера
  const handleLoadFromController = useCallback(async () => {
    // Проверка наличия несохраненных изменений
    if (hasUnsavedChanges || hasDraft) {
      const confirmMessage = 
        'У вас есть несохраненные изменения в текущей конфигурации.\n\n' +
        'Загрузка конфигурации с контроллера заменит текущие данные.\n\n' +
        'Продолжить? Несохраненные изменения будут потеряны.';
      
      const confirmed = await showConfirm(confirmMessage, 'Подтвердите действие');
      if (!confirmed) {
        return; // Пользователь отменил операцию
      }
    }
    
    const loadedConfig = await loadConfigFromServer();
    if (loadedConfig) {
      setCurrentConfigNameState(null);
      setCurrentConfigName(null);
      setOpenedConfigFilePath(null);
      setHasUnsavedChanges(false);
      setHasDraft(false);
      clearDraft();
      setViewMode('edit');
      setActiveTab('general');
      
      // Формируем информативное сообщение об успехе
      const doorCount = loadedConfig.doors?.length || 0;
      const edgeCount = loadedConfig.edges?.length || 0;
      const timeoutCount = loadedConfig.postCloseTimeouts?.length || 0;
      let successMessage = `Конфигурация загружена с контроллера`;
      if (doorCount > 0 || edgeCount > 0 || timeoutCount > 0) {
        const parts = [];
        if (doorCount > 0) parts.push(`${doorCount} ${doorCount === 1 ? 'дверь' : doorCount < 5 ? 'двери' : 'дверей'}`);
        if (edgeCount > 0) parts.push(`${edgeCount} ${edgeCount === 1 ? 'зависимость' : edgeCount < 5 ? 'зависимости' : 'зависимостей'}`);
        if (timeoutCount > 0) parts.push(`${timeoutCount} ${timeoutCount === 1 ? 'таймаут' : timeoutCount < 5 ? 'таймаута' : 'таймаутов'}`);
        successMessage += ` (${parts.join(', ')})`;
      }
      if (loadedConfig.seq) {
        successMessage += `. Версия: ${loadedConfig.seq}`;
      }
      
      setSuccess(successMessage);
      setTimeout(() => setSuccess(null), 5000);
    }
  }, [loadConfigFromServer, hasUnsavedChanges, hasDraft, showConfirm]);

  // Отмена редактирования - выход без сохранения
  const handleCancel = useCallback(async () => {
    // Проверка наличия несохраненных изменений
    if (hasUnsavedChanges || hasDraft) {
      const confirmMessage = 
        'У вас есть несохраненные изменения в текущей конфигурации.\n\n' +
        'Вы действительно хотите выйти без сохранения?\n\n' +
        'Все несохраненные изменения будут потеряны.';
      
      const confirmed = await showConfirm(confirmMessage, 'Подтвердите действие');
      if (!confirmed) {
        return; // Пользователь отменил операцию
      }
    }
    
    // Очищаем состояние
    clearDraft();
    setHasUnsavedChanges(false);
    setHasDraft(false);
    setCurrentConfigNameState(null);
    setCurrentConfigName(null);
    setOpenedConfigFilePath(null);
    setError(null);
    setSuccess(null);
    
    // Возвращаемся в режим списка
    setViewMode('list');
  }, [hasUnsavedChanges, hasDraft, showConfirm]);
  
  // Применение конфигурации на контроллер (PUT /api/config/full)
  const handleApplyToController = useCallback(async () => {
    const validation = validateCurrentConfig();
    if (!validation.valid) {
      setError(`Ошибки валидации: ${validation.errors.join(', ')}`);
      return;
    }

    const doorCount = config.doors?.length ?? 0;
    const edgeCount = config.edges?.length ?? 0;
    const LIMIT_DOORS_V1 = 16; // Увеличено для поддержки MASTER (8) + SLAVE (8)
    const LIMIT_EDGES_V1 = 32; // Увеличено для поддержки большего количества зависимостей
    const LIMIT_POST_CLOSE_V1 = 16; // Увеличено для поддержки 16 дверей

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

    const confirmed = await showConfirm(confirmMessage, 'Подтвердите применение конфигурации');
    if (!confirmed) {
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
      if (config.openTimeoutMs !== 0 && (config.openTimeoutMs < 1000 || config.openTimeoutMs > 3600000)) {
        setError('Таймаут открытия должен быть 0 (нет сигнализации) или от 1000 до 3600000 мс');
        setSaving(false);
        return;
      }

      const trimmedProjectName = config.projectName.trim();
      if (trimmedProjectName.length > 100) {
        setError('Название проекта не может быть длиннее 100 символов');
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
        noAlarm: config.noAlarm === true,
        doors,
        edges: config.edges || [],
        postCloseTimeouts: config.postCloseTimeouts || [],
        net: config.net || { dhcpEnabled: 1, webPort: 8080 },
      };

      const jsonString = JSON.stringify(fullConfig);
      const jsonSize = new Blob([jsonString]).size;
      if (jsonSize > 4096) {
        setError(`Размер данных слишком большой: ${jsonSize} байт (максимум 4096). Уменьшите число дверей или длины комментариев.`);
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
            console.log('[DoorsConfig] Error data object:', data);
            if (data.error) {
              errorMessage = `Ошибка валидации: ${data.error}`;
            } else if (data.errorMsg) {
              errorMessage = `Ошибка валидации: ${data.errorMsg}`;
            } else {
              // Показываем весь объект ошибки для диагностики
              const errorDetails = JSON.stringify(data);
              errorMessage = `Ошибка валидации данных на сервере: ${errorDetails}`;
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
          <h1>Список конфигураций</h1>
        </div>
        
        {/* Панель управления (только в режиме списка) */}
        <div className="doors-config-toolbar doors-config-toolbar--list">
          <div className="toolbar-left">
            <Button onClick={handleImport}>
              Открыть конфигурацию
            </Button>
            <Button onClick={handleCreateConfig}>
              Создать конфигурацию
            </Button>
            <Button onClick={handleLoadFromController} disabled={loading}>
              {loading ? 'Загрузка...' : 'Загрузить с контроллера'}
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
          <h3>Сохраненные конфигурации ({savedConfigsList.length})</h3>
          
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
                  <Button 
                    onClick={handleDeleteDraftClick}
                    variant="secondary"
                    size="small"
                  >
                    Удалить
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
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteModalForDraft(false);
                        setDeleteModalName(item.name);
                        setDeleteModalVisible(true);
                      }}
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
          
          {/* Сообщение, если нет конфигураций */}
          {savedConfigsList.length === 0 && !hasDraft && (
            <div className="empty-state">
              <p>Нет сохраненных конфигураций. Используйте кнопку "Создать конфигурацию" в панели управления выше.</p>
            </div>
          )}
        </div>

        {/* Модальное окно удаления — для черновика и сохранённых конфигураций */}
        <Modal
          isOpen={deleteModalVisible}
          type="confirm"
          title={deleteModalForDraft ? 'Удаление черновика' : 'Удаление конфигурации'}
          message={deleteModalForDraft
            ? 'Удалить несохранённую конфигурацию? Все изменения будут потеряны.'
            : (deleteModalName ? `Удалить конфигурацию "${deleteModalName}"?` : '')
          }
          confirmText="Да"
          cancelText="Нет"
          onConfirm={() => {
            const isDraft = deleteModalForDraft;
            const name = deleteModalName;
            const currentName = currentConfigName;
            setDeleteModalVisible(false);
            setDeleteModalName(null);
            setDeleteModalForDraft(false);
            if (isDraft) {
              doDeleteDraft();
            } else if (name && deleteNamedConfig(name)) {
              setTimeout(() => setSavedConfigsList(getSavedConfigsList()), 0);
              if (currentName === name) {
                setCurrentConfigNameState(null);
                setCurrentConfigName(null);
              }
              setSuccess(`Конфигурация "${name}" удалена`);
              setTimeout(() => setSuccess(null), 3000);
            } else if (name) {
              setError('Ошибка удаления конфигурации');
            }
          }}
          onCancel={() => {
            setDeleteModalVisible(false);
            setDeleteModalName(null);
            setDeleteModalForDraft(false);
          }}
        />
      </div>
    );
  }
  
  // Текст пути/источника конфигурации (редактируемый для вставки полного пути)
  const configFileName = currentConfigName
    ? currentConfigName.replace(/[^a-zA-Z0-9\u0400-\u04FF]/g, '_') + '_conf.json'
    : '';
  const configSourceDisplay = openedConfigFilePath
    ? openedConfigFilePath
    : currentConfigName
      ? `Сохранённая: ${configFileName}`
      : 'Новая конфигурация';
  const isPathEditable = !!openedConfigFilePath || !!currentConfigName;

  // Режим редактирования
  return (
    <div className="doors-config">
      <div className="doors-config-header">
        <h1>Редактирование конфигурации</h1>
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

      {/* Путь к файлу / источник конфигурации (редактируемый для полного пути) */}
      <div className="config-source-path-wrap">
        <input
          type="text"
          className="config-source-path"
          value={configSourceDisplay}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (openedConfigFilePath != null || currentConfigName) {
              setOpenedConfigFilePath(v || null);
            }
          }}
          readOnly={!isPathEditable}
          placeholder="Путь к файлу конфигурации"
          title="Браузер даёт только имя файла. Вставьте полный путь из проводника при необходимости."
        />
      </div>
      
      {/* Панель управления (в режиме редактирования) */}
      <div className="doors-config-toolbar doors-config-toolbar--edit">
        <div className="toolbar-left">
          <Button onClick={handleLoadFromController} disabled={loading}>
            {loading ? 'Загрузка...' : 'Загрузить с контроллера'}
          </Button>
          <Button onClick={handleSaveConfig}>
            Сохранить конфигурацию
          </Button>
          <Button
            onClick={handleSaveAs}
            disabled={!currentConfigName && !openedConfigFilePath}
            title={(!currentConfigName && !openedConfigFilePath) ? 'Доступно только для сохранённых конфигураций' : 'Сохранить в другой файл или под другим именем'}
          >
            Сохранить как...
          </Button>
          <Button onClick={handleSaveAndExit}>
            Сохранить и Выйти
          </Button>
          <Button onClick={handleCancel}>
            Отмена
          </Button>
          <Button
            onClick={() => navigate('/configuration/mapping', { state: { configBaseName: currentConfigName || config.projectName || '' } })}
            title="Редактор карты маппинга для этой конфигурации (ИМЯ_map.json)"
          >
            Маппинг
          </Button>
        </div>
        <div className="toolbar-right toolbar-right--apply">
          <Button
            onClick={handleApplyToController}
            disabled={saving || loading}
          >
            {saving ? 'Применение...' : 'Применить на контроллер'}
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
      
      {/* Отображение имени конфигурации в режиме редактирования */}
      {viewMode === 'edit' && (
        <div className="config-name-header" style={{ 
          marginBottom: '20px', 
          padding: '12px 16px', 
          backgroundColor: '#f5f5f5', 
          borderRadius: '8px',
          border: '1px solid #ddd'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>
            {currentConfigName ? (
              <>Конфигурация: <span style={{ color: '#0066cc' }}>{currentConfigName}</span></>
            ) : config.projectName ? (
              <>Проект: <span style={{ color: '#0066cc' }}>{config.projectName}</span></>
            ) : (
              <>Новая конфигурация</>
            )}
          </h2>
        </div>
      )}
      
      {/* Вкладки */}
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
              showConfirm={showConfirm}
            />
          )}
          {activeTab === 'dependencies' && (
            <DependenciesTab 
              config={config} 
              updateConfig={updateConfig}
              loading={loading}
              showConfirm={showConfirm}
            />
          )}
          {activeTab === 'timeouts' && (
            <TimeoutsTab 
              config={config} 
              updateConfig={updateConfig}
              loading={loading}
              showConfirm={showConfirm}
            />
          )}
        </div>
      </div>
      
      {/* Модальное окно */}
      <Modal
        isOpen={modal.isOpen}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        defaultValue={modal.defaultValue}
        placeholder={modal.placeholder}
        confirmText={modal.confirmText}
        cancelText={modal.cancelText}
        onConfirm={modal.onConfirm}
        onCancel={modal.onCancel}
      />
      
      {/* Модальное окно для удаления конфигурации */}
      <Modal
        isOpen={deleteModalVisible}
        type="confirm"
        title="Удаление конфигурации"
        message={deleteModalName ? `Удалить конфигурацию "${deleteModalName}"?` : ''}
        confirmText="Да"
        cancelText="Нет"
        onConfirm={() => {
          const name = deleteModalName;
          const currentName = currentConfigName;
          setDeleteModalVisible(false);
          setDeleteModalName(null);
          if (name && deleteNamedConfig(name)) {

            // Обновляем список в следующем тике, чтобы React гарантированно применил обновление (модалка уже закрыта)
            setTimeout(() => {
              setSavedConfigsList(getSavedConfigsList());
            }, 0);
            if (currentName === name) {
              setCurrentConfigNameState(null);
              setCurrentConfigName(null);
            }
            setSuccess(`Конфигурация "${name}" удалена`);
            setTimeout(() => setSuccess(null), 3000);
          } else if (name) {
            setError('Ошибка удаления конфигурации');
          }
        }}
        onCancel={() => {
          setDeleteModalVisible(false);
          setDeleteModalName(null);
        }}
      />
    </div>
  );
};

export default DoorsConfig;
