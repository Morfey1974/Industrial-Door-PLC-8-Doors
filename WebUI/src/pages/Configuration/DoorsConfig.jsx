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
import { useLanguage } from '../../context/LanguageContext';
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
  const { t, language } = useLanguage();
  /**
   * Число + локализованное существительное (RU с падежом для 2–4/5+, EN: 1 vs мн. ч.).
   */
  const countLabel = useCallback((n, keyOne, keyFew, keyMany) => {
    if (language === 'en') {
      const word = n === 1 ? t(keyOne) : t(keyMany);
      return `${n} ${word}`;
    }
    const nn = n % 100;
    let wordKey = keyMany;
    if (nn < 11 || nn > 14) {
      const u = n % 10;
      if (u === 1) wordKey = keyOne;
      else if (u >= 2 && u <= 4) wordKey = keyFew;
    }
    return `${n} ${t(wordKey)}`;
  }, [language, t]);
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
  const showConfirm = useCallback((message, title) => {
    const titleResolved = title ?? t('pages.config.modalConfirmAction');
    return new Promise((resolve) => {
      // Сохраняем resolve функцию в ref
      modalResolveRef.current = resolve;
      
      // Используем flushSync для принудительного синхронного обновления DOM
      // ВАЖНО: flushSync должен быть вызван синхронно, до возврата Promise
      flushSync(() => {
        setModal({
          isOpen: true,
          type: 'confirm',
          title: titleResolved,
          message,
          confirmText: t('pages.config.yes'),
          cancelText: t('pages.config.no'),
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
  }, [t]);

  const showPrompt = useCallback((message, defaultValue = '', title, placeholder = '') => {
    const titleResolved = title ?? t('pages.config.modalEnterValue');
    return new Promise((resolve) => {
      // Сохраняем resolve функцию в ref
      modalResolveRef.current = resolve;
      
      // Используем flushSync для принудительного синхронного обновления DOM
      // Это гарантирует, что модальное окно появится сразу
      flushSync(() => {
        setModal({
          isOpen: true,
          type: 'prompt',
          title: titleResolved,
          message,
          defaultValue,
          placeholder,
          confirmText: t('common.ok'),
          cancelText: t('common.cancel'),
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
  }, [t]);
  
  // Загрузка конфигурации с сервера
  const loadConfigFromServer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const serverConfig = await getConfigFull();
      
      // Проверка структуры ответа
      if (!serverConfig || typeof serverConfig !== 'object') {
        throw new Error(t('pages.config.serverInvalidFormat'));
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
      // При загрузке с контроллера пустое имя проекта допустимо — не включаем в список ошибок
      const validation = validateConfig(transformedConfig, { t, ignoreEmptyProjectName: true });
      if (!validation.valid) {
        console.warn('Загруженная конфигурация имеет ошибки валидации:', validation.errors);
        setError(t('pages.config.loadWarnCritical', { errors: validation.errors.join(', ') }));
      } else if (!transformedConfig.projectName?.trim()) {
        console.info('Загруженная конфигурация: projectName пустое (можно заполнить позже)');
      }
      
      setConfig(transformedConfig);
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      setHasDraft(false);
      
      return transformedConfig;
    } catch (err) {
      console.error('Ошибка загрузки конфигурации:', err);
      
      // Улучшенная обработка ошибок
      let errorMessage = t('pages.config.loadErrorGeneric');

      if (err.response) {
        const status = err.response.status;
        if (status === 404) {
          errorMessage = t('pages.config.loadError404');
        } else if (status === 500) {
          errorMessage = t('pages.config.loadError500');
        } else if (status >= 400 && status < 500) {
          errorMessage = t('pages.config.loadErrorClient', { status: String(status) });
        } else {
          errorMessage = t('pages.config.loadErrorServerStatus', { status: String(status) });
        }
      } else if (err.request) {
        if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
          errorMessage = t('pages.config.loadErrorTimeout');
        } else if (err.code === 'ERR_CONNECTION_RESET') {
          errorMessage = t('pages.config.loadErrorReset');
        } else if (err.code === 'ERR_NETWORK') {
          errorMessage = t('pages.config.loadErrorNetwork');
        } else {
          errorMessage = t('pages.config.loadErrorNoResponse');
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, [t]);
  
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
    return validateConfig(config, { t });
  }, [config, t]);
  
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
    const name = await showPrompt(
      t('pages.config.promptConfigName'),
      '',
      t('pages.config.promptSaveTitle')
    );
    if (!name || name.trim().length === 0) return;

    const trimmedName = name.trim();
    if (saveNamedConfig(trimmedName, config)) {
      setSavedConfigsList(getSavedConfigsList());
      setCurrentConfigNameState(trimmedName);
      setCurrentConfigName(trimmedName);
      setHasUnsavedChanges(false);
      setHasDraft(false);
      clearDraft();
      setSuccess(t('pages.config.msgSavedNamed', { name: trimmedName }));
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(t('pages.config.msgSaveError'));
    }
  }, [config, t, showPrompt]);
  
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
    setSuccess(t('pages.config.msgDraftDeleted'));
    setTimeout(() => setSuccess(null), 3000);
  }, [t]);
  
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
      setSuccess(t('pages.config.msgLoadedNamed', { name }));
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(t('pages.config.msgLoadErrorNamed', { name }));
    }
  }, [t]);
  
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
        title: t('pages.config.deleteConfigTitle'),
        message: t('pages.config.deleteConfigMessage', { name }),
        confirmText: t('pages.config.yes'),
        cancelText: t('pages.config.no'),
        onConfirm: () => {
          const configName = deleteConfigNameRef.current;
          setModal(prev => ({ ...prev, isOpen: false }));
          if (configName && deleteNamedConfig(configName)) {
            setSavedConfigsList(getSavedConfigsList());
            if (currentConfigName === configName) {
              setCurrentConfigNameState(null);
              setCurrentConfigName(null);
            }
            setSuccess(t('pages.config.deleteSuccessNamed', { name: configName }));
            setTimeout(() => setSuccess(null), 3000);
          } else if (configName) {
            setError(t('pages.config.deleteError'));
          }
        },
        onCancel: () => {
          setModal(prev => ({ ...prev, isOpen: false }));
        },
      });
    }, 0);
  }, [currentConfigName, t]);
  
  // Сохранение конфигурации (без выхода)
  const handleSaveConfig = useCallback(async () => {
    if (!currentConfigName && !openedConfigFilePath) {
      // Новая конфигурация — открываем диалог выбора места и сохраняем в файл
      const validation = validateCurrentConfig();
      if (!validation.valid) {
        setError(t('pages.config.validationErrorsPrefix', { errors: validation.errors.join(', ') }));
        return;
      }
      const base = config.projectName || 'config';
      const filename = base.replace(/[^a-zA-Z0-9\u0400-\u04FF]/g, '_') + '_conf.json';
      const result = await exportConfigToFile(config, filename);
      if (!result.ok) {
        if (!result.cancelled) setError(t('pages.config.msgSaveError'));
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
      setSuccess(t('pages.config.msgSavedToFile'));
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
        setSuccess(t('pages.config.msgSavedNamed', { name }));
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(t('pages.config.msgSaveError'));
      }
      return;
    }

    // Существующая конфигурация — сохраняем в список
    const validation = validateCurrentConfig();
    if (!validation.valid) {
      setError(t('pages.config.validationErrorsPrefix', { errors: validation.errors.join(', ') }));
      return;
    }

    if (saveNamedConfig(currentConfigName, config)) {
      setSavedConfigsList(getSavedConfigsList());
      setHasUnsavedChanges(false);
      setHasDraft(false);
      clearDraft();
      setSuccess(t('pages.config.msgSavedNamed', { name: currentConfigName }));
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(t('pages.config.msgSaveError'));
    }
  }, [config, currentConfigName, openedConfigFilePath, validateCurrentConfig, t]);
  
  // Сохранение конфигурации и выход в список
  const handleSaveAndExit = useCallback(async () => {
    let savedName = currentConfigName;
    if (!currentConfigName && !openedConfigFilePath) {
      // Новая конфигурация — открываем диалог и сохраняем в файл, затем выходим
      const validation = validateCurrentConfig();
      if (!validation.valid) {
        setError(t('pages.config.validationErrorsPrefix', { errors: validation.errors.join(', ') }));
        return;
      }
      const base = config.projectName || 'config';
      const filename = base.replace(/[^a-zA-Z0-9\u0400-\u04FF]/g, '_') + '_conf.json';
      const result = await exportConfigToFile(config, filename);
      if (!result.ok) {
        if (!result.cancelled) setError(t('pages.config.msgSaveError'));
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
        setError(t('pages.config.msgSaveError'));
        return;
      }
      setCurrentConfigNameState(savedName);
      setCurrentConfigName(savedName);
    } else {
      // Существующая конфигурация
      const validation = validateCurrentConfig();
      if (!validation.valid) {
        setError(t('pages.config.validationErrorsPrefix', { errors: validation.errors.join(', ') }));
        return;
      }
      if (!saveNamedConfig(currentConfigName, config)) {
        setError(t('pages.config.msgSaveError'));
        return;
      }
    }

    setSavedConfigsList(getSavedConfigsList());
    setHasUnsavedChanges(false);
    setHasDraft(false);
    clearDraft();
    setViewMode('list');
    setSuccess(
      savedName
        ? t('pages.config.msgSaveExit', { name: savedName })
        : t('pages.config.msgSaveExitNew')
    );
    setTimeout(() => setSuccess(null), 3000);
  }, [config, currentConfigName, openedConfigFilePath, validateCurrentConfig, t]);
  
  // Сохранение как — окно выбора места сохранения (экспорт в файл)
  const handleSaveAs = useCallback(async () => {
    const validation = validateCurrentConfig();
    if (!validation.valid) {
      setError(t('pages.config.validationErrorsPrefix', { errors: validation.errors.join(', ') }));
      return;
    }

    const base = currentConfigName || config.projectName || 'config';
    const filename = base.replace(/[^a-zA-Z0-9\u0400-\u04FF]/g, '_') + '_conf.json';
    const result = await exportConfigToFile(config, filename);

    if (result.ok) {
      if (result.filename) {
        setOpenedConfigFilePath(result.filename);
      }
      setSuccess(t('pages.config.msgSavedToFile'));
      setTimeout(() => setSuccess(null), 3000);
    } else if (!result.cancelled) {
      setError(t('pages.config.msgSaveError'));
    }
  }, [config, currentConfigName, validateCurrentConfig, t]);
  
  // Импорт конфигурации (Открыть конфигурацию в списке)
  const handleImport = useCallback(async () => {
    const loadFromFile = async (file) => {
      try {
        const importedConfig = await importConfigFromFile(file);
        const validation = validateConfig(importedConfig, { t });
        if (!validation.valid) {
          setError(t('pages.config.validationErrorsPrefix', { errors: validation.errors.join(', ') }));
          return;
        }
        setConfig(importedConfig);
        setCurrentConfigNameState(null);
        setCurrentConfigName(null);
        setOpenedConfigFilePath(file.path || file.name || '');
        setHasUnsavedChanges(true);
        setHasDraft(true);
        setViewMode('edit');
        setActiveTab('general');
        setSuccess(t('pages.config.msgOpened'));
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        setError(t('pages.config.msgImportError', { error: err.message }));
      }
    };

    if (typeof window.showOpenFilePicker === 'function') {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: t('pages.config.filePickerJsonDesc'), accept: { 'application/json': ['.json'] } }],
          id: 'industrial-door-configs',
          startIn: 'documents',
        });
        const file = await handle.getFile();
        await loadFromFile(file);
      } catch (err) {
        if (err?.name !== 'AbortError') setError(t('pages.config.msgPickFileError', { error: err.message }));
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
  }, [t]);
  
  // Загрузка конфигурации с контроллера
  const handleLoadFromController = useCallback(async () => {
    if (hasUnsavedChanges || hasDraft) {
      const confirmed = await showConfirm(
        t('pages.config.loadControllerUnsavedWarn'),
        t('pages.config.modalConfirmAction')
      );
      if (!confirmed) {
        return;
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

      const doorCount = loadedConfig.doors?.length || 0;
      const edgeCount = loadedConfig.edges?.length || 0;
      const timeoutCount = loadedConfig.postCloseTimeouts?.length || 0;
      let successMessage = t('pages.config.msgLoadedFromController');
      if (doorCount > 0 || edgeCount > 0 || timeoutCount > 0) {
        const parts = [];
        if (doorCount > 0) {
          parts.push(countLabel(doorCount, 'pages.config.wordDoorOne', 'pages.config.wordDoorFew', 'pages.config.wordDoorMany'));
        }
        if (edgeCount > 0) {
          parts.push(countLabel(edgeCount, 'pages.config.wordEdgeOne', 'pages.config.wordEdgeFew', 'pages.config.wordEdgeMany'));
        }
        if (timeoutCount > 0) {
          parts.push(countLabel(timeoutCount, 'pages.config.wordTimeoutOne', 'pages.config.wordTimeoutFew', 'pages.config.wordTimeoutMany'));
        }
        successMessage += ` (${parts.join(', ')})`;
      }
      if (loadedConfig.seq) {
        successMessage += `. ${t('pages.config.msgLoadedFromControllerVersion', { seq: String(loadedConfig.seq) })}`;
      }

      setSuccess(successMessage);
      setTimeout(() => setSuccess(null), 5000);
    }
  }, [loadConfigFromServer, hasUnsavedChanges, hasDraft, showConfirm, t, countLabel]);

  // Отмена редактирования - выход без сохранения
  const handleCancel = useCallback(async () => {
    if (hasUnsavedChanges || hasDraft) {
      const confirmed = await showConfirm(
        t('pages.config.cancelEditUnsavedWarn'),
        t('pages.config.modalConfirmAction')
      );
      if (!confirmed) {
        return;
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
  }, [hasUnsavedChanges, hasDraft, showConfirm, t]);
  
  // Применение конфигурации на контроллер (PUT /api/config/full)
  const handleApplyToController = useCallback(async () => {
    const validation = validateCurrentConfig();
    if (!validation.valid) {
      setError(t('pages.config.validationErrorsPrefix', { errors: validation.errors.join(', ') }));
      return;
    }

    const doorCount = config.doors?.length ?? 0;
    const edgeCount = config.edges?.length ?? 0;
    const LIMIT_DOORS_V1 = 32;
    const LIMIT_EDGES_V1 = 64;
    const LIMIT_POST_CLOSE_V1 = 32;

    if (doorCount > LIMIT_DOORS_V1) {
      setError(t('pages.config.errDoorsLimit', { limit: String(LIMIT_DOORS_V1), count: String(doorCount) }));
      return;
    }
    if (edgeCount > LIMIT_EDGES_V1) {
      setError(t('pages.config.errEdgesLimit', { limit: String(LIMIT_EDGES_V1), count: String(edgeCount) }));
      return;
    }
    const pctCount = config.postCloseTimeouts?.length ?? 0;
    if (pctCount > LIMIT_POST_CLOSE_V1) {
      setError(t('pages.config.errPostCloseLimit', { limit: String(LIMIT_POST_CLOSE_V1), count: String(pctCount) }));
      return;
    }

    const confirmMessage = t('pages.config.applyConfirmBody', {
      doors: String(doorCount),
      edges: String(edgeCount),
      limitDoors: String(LIMIT_DOORS_V1),
    });

    const confirmed = await showConfirm(confirmMessage, t('pages.config.modalConfirmApply'));
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(t('pages.config.applyProgress'));

    try {
      if (!config.projectName || config.projectName.trim().length === 0) {
        setError(t('pages.config.errProjectNameEmpty'));
        setSaving(false);
        return;
      }
      if (config.openTimeoutMs !== 0 && (config.openTimeoutMs < 1000 || config.openTimeoutMs > 3600000)) {
        setError(t('pages.config.errOpenTimeoutRange'));
        setSaving(false);
        return;
      }

      const trimmedProjectName = config.projectName.trim();
      if (trimmedProjectName.length > 100) {
        setError(t('pages.config.errProjectNameLength'));
        setSaving(false);
        return;
      }

      const doors = (config.doors || []).map((d) => ({
        techId: d.techId,
        drawingId: d.drawingId ?? 0,
        nodeId: d.nodeId,
        localDoor: d.localDoor,
        globalDoorId: d.globalDoorId ?? ((d.nodeId - 1) * 8 + d.localDoor),
        type: d.type === 'NO' ? 'NO' : 'NC',
        typeCode: d.typeCode ?? (d.type === 'NO' ? 1 : 0),
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
        setError(t('pages.config.errJsonTooLarge', { size: String(jsonSize) }));
        setSaving(false);
        return;
      }

      console.log('[DoorsConfig] PUT /api/config/full:', { doors: doors.length, edges: fullConfig.edges.length, postCloseTimeouts: fullConfig.postCloseTimeouts.length, jsonSize });
      const response = await putConfigFull(fullConfig);
      console.log('Ответ от контроллера:', response);

      if (response && response.ok === 0) {
        const errorMsg = response.error || response.errorMsg || t('pages.config.errServerUnknown');
        setError(t('pages.config.errServerPrefix', { msg: errorMsg }));
        setSaving(false);
        return;
      }

      clearDraft();
      setHasUnsavedChanges(false);
      setHasDraft(false);

      // Контроллер перезагружается после записи в Flash — сессии в RAM теряются.
      sessionStorage.setItem('config_just_applied', Date.now().toString());

      setSuccess(t('pages.config.applySuccess'));
      setSaving(false);
      // Перенаправляем на страницу входа с пояснением, чтобы пользователь не оставался
      // на странице с «мёртвой» сессией и не получал 401 при следующем действии.
      setTimeout(() => {
        window.location.href = '/login?reason=config_applied';
      }, 2500);
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
      
      let errorMessage = t('pages.config.errApplyGeneric');

      if (err.response) {
        const status = err.response.status;
        const data = err.response.data;

        if (status === 400) {
          const statusText = err.response?.statusText || '';

          if (statusText.includes('Bad Headers') || (typeof data === 'string' && data.includes('Bad Headers'))) {
            errorMessage = t('pages.config.errBadHeaders');
          } else if (statusText.includes('Bad Body') || (typeof data === 'string' && data.includes('Bad Body'))) {
            errorMessage = t('pages.config.errBadBody');
          } else if (data && typeof data === 'object') {
            console.log('[DoorsConfig] Error data object:', data);
            if (data.error) {
              errorMessage = t('pages.config.errValidationServer', { msg: data.error });
            } else if (data.errorMsg) {
              errorMessage = t('pages.config.errValidationServer', { msg: data.errorMsg });
            } else {
              const errorDetails = JSON.stringify(data);
              errorMessage = t('pages.config.errValidationServerObj', { details: errorDetails });
            }
          } else if (typeof data === 'string') {
            if (data.includes('error')) {
              try {
                const parsed = JSON.parse(data);
                if (parsed.error || parsed.errorMsg) {
                  errorMessage = t('pages.config.errValidationServer', {
                    msg: parsed.error || parsed.errorMsg,
                  });
                } else {
                  errorMessage = t('pages.config.errServerPrefix', { msg: data });
                }
              } catch (e) {
                errorMessage = t('pages.config.errServerPrefix', { msg: data });
              }
            } else {
              errorMessage = t('pages.config.errServerPrefix', { msg: data });
            }
          } else {
            errorMessage = t('pages.config.errValidationGeneric');
          }
        } else if (status === 500) {
          errorMessage = t('pages.config.errServer500');
        } else {
          errorMessage = t('pages.config.errServerCode', { status: String(status) });
          if (data && data.error) {
            errorMessage += `: ${data.error}`;
          }
        }
      } else if (err.request) {
        if (err.code === 'ERR_CONNECTION_RESET') {
          errorMessage = t('pages.config.errConnectionReset');
        } else if (err.code === 'ERR_NETWORK') {
          errorMessage = t('pages.config.loadErrorNetwork');
        } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout') || err.message?.includes('таймаут')) {
          errorMessage = t('pages.config.errApplyTimeout');
        } else {
          errorMessage = t('pages.config.errNoResponseApply');
        }
      } else {
        if (err.code === 'ECONNABORTED' || err.message?.includes('timeout') || err.message?.includes('таймаут') || err.message?.includes('Превышено время ожидания')) {
          errorMessage = t('pages.config.errApplyTimeout');
        } else {
          errorMessage = err.message || t('pages.config.errRequestFailed');
        }
      }
      
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  }, [config, validateCurrentConfig, t, showConfirm]);

  const tabs = [
    { id: 'general', label: t('pages.config.tabGeneral') },
    { id: 'doors', label: t('pages.config.tabDoors') },
    { id: 'dependencies', label: t('pages.config.tabDependencies') },
    { id: 'timeouts', label: t('pages.config.tabTimeouts') },
  ];
  
  // Режим списка конфигураций
  if (viewMode === 'list') {
    const formatDoorsCount = (count) => {
      const n = Number(count) || 0;
      if (language === 'en') return `${n} doors`;
      return `${n} дверей`;
    };

    return (
      <div className="doors-config">
        <div className="doors-config-header">
          <h1>{t('pages.config.configList')}</h1>
        </div>
        
        {/* Панель управления (только в режиме списка) */}
        <div className="doors-config-toolbar doors-config-toolbar--list">
          <div className="toolbar-left">
            <Button onClick={handleImport}>
              {t('pages.config.openConfig')}
            </Button>
            <Button onClick={handleCreateConfig}>
              {t('pages.config.createConfig')}
            </Button>
            <Button onClick={handleLoadFromController} disabled={loading}>
              {loading ? t('common.loading') : t('pages.config.loadFromController')}
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
          <h3>{t('pages.config.savedConfigs')} ({savedConfigsList.length})</h3>
          
          {/* Несохраненная конфигурация (черновик) */}
          {hasDraft && (
            <div className="saved-configs-grid">
              <div className="saved-config-item unsaved-config">
                <div className="saved-config-info">
                  <strong>{t('pages.config.unsavedConfig')}</strong>
                  <span className="saved-config-date">
                    {lastSaved
                      ? `${t('pages.config.modified')}: ${lastSaved.toLocaleString(language === 'en' ? 'en-US' : 'ru-RU')}`
                      : t('pages.config.draft')}
                  </span>
                </div>
                <div className="saved-config-actions">
                  <Button 
                    onClick={handleLoadDraft}
                    variant="secondary"
                    size="small"
                  >
                    {t('pages.config.loadConfig')}
                  </Button>
                  <Button 
                    onClick={handleSaveDraft}
                    variant="primary"
                    size="small"
                  >
                    {t('pages.config.saveConfig')}
                  </Button>
                  <Button 
                    onClick={handleDeleteDraftClick}
                    variant="secondary"
                    size="small"
                  >
                    {t('pages.config.deleteConfig')}
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
                    <span>{formatDoorsCount(item.doorCount)}</span>
                    <span className="saved-config-date">
                      {new Date(item.timestamp).toLocaleDateString(language === 'en' ? 'en-US' : 'ru-RU')}
                    </span>
                  </div>
                  <div className="saved-config-actions">
                    <Button 
                      onClick={() => handleLoadConfig(item.name)}
                      variant="secondary"
                      size="small"
                    >
                      {t('pages.config.loadConfig')}
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
                      {t('pages.config.deleteConfig')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Сообщение, если нет конфигураций */}
          {savedConfigsList.length === 0 && !hasDraft && (
            <div className="empty-state">
              <p>{t('pages.config.noSavedConfigs')}</p>
            </div>
          )}
        </div>

        {/* Модальное окно удаления — для черновика и сохранённых конфигураций */}
        <Modal
          isOpen={deleteModalVisible}
          type="confirm"
          title={deleteModalForDraft ? t('pages.config.deleteDraftTitle') : t('pages.config.deleteConfigTitle')}
          message={deleteModalForDraft
            ? t('pages.config.deleteDraftMessage')
            : (deleteModalName ? t('pages.config.deleteConfigMessage', { name: deleteModalName }) : '')
          }
          confirmText={t('pages.config.yes')}
          cancelText={t('pages.config.no')}
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
              setSuccess(t('pages.config.deleteSuccessNamed', { name }));
              setTimeout(() => setSuccess(null), 3000);
            } else if (name) {
              setError(t('pages.config.deleteError'));
            }
          }}
          onCancel={() => {
            setDeleteModalVisible(false);
            setDeleteModalName(null);
            setDeleteModalForDraft(false);
          }}
        />

        {/* Подтверждения и запросы ввода (загрузка с контроллера и т.д. в режиме списка) */}
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
      ? t('pages.config.sourceSaved', { file: configFileName })
      : t('pages.config.sourceNew');
  const isPathEditable = !!openedConfigFilePath || !!currentConfigName;

  // Режим редактирования
  return (
    <div className="doors-config">
      <div className="doors-config-header">
        <h1>{t('pages.config.editConfig')}</h1>
        <div className="doors-config-status">
          {hasUnsavedChanges && lastSaved && (
            <span className="auto-save-indicator">
              💾 {t('pages.config.statusDraftSaved', {
                time: lastSaved.toLocaleTimeString(language === 'en' ? 'en-US' : 'ru-RU'),
              })}
            </span>
          )}
          {!hasUnsavedChanges && currentConfigName && (
            <span className="auto-save-indicator" style={{ color: '#3c3' }}>
              ✓ {t('pages.config.statusNamedSaved', { name: currentConfigName })}
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
          placeholder={t('pages.config.pathPlaceholder')}
          title={t('pages.config.pathInputTitle')}
        />
      </div>
      
      {/* Панель управления (в режиме редактирования) */}
      <div className="doors-config-toolbar doors-config-toolbar--edit">
        <div className="toolbar-left">
          <Button onClick={handleLoadFromController} disabled={loading}>
            {loading ? t('common.loading') : t('pages.config.toolbarLoadController')}
          </Button>
          <Button onClick={handleSaveConfig}>
            {t('pages.config.toolbarSave')}
          </Button>
          <Button
            onClick={handleSaveAs}
            disabled={!currentConfigName && !openedConfigFilePath}
            title={(!currentConfigName && !openedConfigFilePath)
              ? t('pages.config.saveAsTitleDisabled')
              : t('pages.config.saveAsTitle')}
          >
            {t('pages.config.toolbarSaveAs')}
          </Button>
          <Button onClick={handleSaveAndExit}>
            {t('pages.config.toolbarSaveExit')}
          </Button>
          <Button onClick={handleCancel}>
            {t('pages.config.toolbarCancel')}
          </Button>
          <Button
            onClick={() => navigate('/configuration/mapping', { state: { configBaseName: currentConfigName || config.projectName || '' } })}
            title={t('pages.config.toolbarMappingTitle')}
          >
            {t('pages.config.toolbarMapping')}
          </Button>
        </div>
        <div className="toolbar-right toolbar-right--apply">
          <Button
            onClick={handleApplyToController}
            disabled={saving || loading}
          >
            {saving ? t('pages.config.toolbarApplying') : t('pages.config.toolbarApply')}
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
              <>
                {t('pages.config.subtitleConfigLead')}{' '}
                <span style={{ color: '#0066cc' }}>{currentConfigName}</span>
              </>
            ) : config.projectName ? (
              <>
                {t('pages.config.subtitleProjectLead')}{' '}
                <span style={{ color: '#0066cc' }}>{config.projectName}</span>
              </>
            ) : (
              <>{t('pages.config.subtitleNew')}</>
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
    </div>
  );
};

export default DoorsConfig;
