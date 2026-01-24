/**
 * DoorsConfig страница - настройка дверей
 * 
 * Реализует:
 * - Вкладки: Общие параметры, Двери, Зависимости, Таймауты
 * - Автосохранение в LocalStorage
 * - Экспорт/импорт JSON
 * - Валидацию конфигурации
 * - Применение конфигурации на контроллер
 */

import { useState, useEffect, useCallback } from 'react';
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
import { validateConfig, calculateGlobalDoorId } from '../../utils/configValidator';
import Button from '../../components/common/Button';
import './DoorsConfig.css'; // Стили для страницы конфигурации

// Компоненты вкладок
import GeneralTab from './DoorsConfigTabs/GeneralTab';
import DoorsTab from './DoorsConfigTabs/DoorsTab';
import DependenciesTab from './DoorsConfigTabs/DependenciesTab';
import TimeoutsTab from './DoorsConfigTabs/TimeoutsTab';

const DoorsConfig = () => {
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false); // Флаг наличия несохраненных изменений
  
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
      setHasUnsavedChanges(false); // Конфигурация загружена с сервера, изменений нет
      
      // НЕ сохраняем в черновик при загрузке с сервера - это не черновик, а актуальная конфигурация
      // Черновик сохраняется только при реальных изменениях пользователем
    } catch (err) {
      console.error('Ошибка загрузки конфигурации:', err);
      setError(`Ошибка загрузки: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Загрузка при монтировании компонента
  useEffect(() => {
    // Проверяем наличие черновика
    const draft = loadDraft();
    if (draft) {
      // Проверяем, есть ли в черновике реальные изменения (не пустая конфигурация)
      const hasRealChanges = draft.projectName || draft.doors?.length > 0;
      
      if (hasRealChanges) {
        // Предлагаем восстановить черновик только если есть реальные изменения
        const shouldRestore = window.confirm(
          'Обнаружен несохраненный черновик конфигурации. Восстановить?'
        );
        if (shouldRestore) {
          setConfig(draft);
          setLastSaved(new Date(draft.timestamp));
          setHasUnsavedChanges(true); // Восстановленный черновик считается измененным
        } else {
          clearDraft();
          loadConfigFromServer();
        }
      } else {
        // Если черновик пустой, просто очищаем его и загружаем с сервера
        clearDraft();
        loadConfigFromServer();
      }
    } else {
      loadConfigFromServer();
    }
    
    // Загружаем список сохраненных конфигураций
    setSavedConfigsList(getSavedConfigsList());
    setCurrentConfigNameState(getCurrentConfigName());
  }, [loadConfigFromServer]);
  
  // Автосохранение при изменении конфигурации (только если есть реальные изменения)
  useEffect(() => {
    // Сохраняем черновик только если:
    // 1. Есть реальные данные (projectName или двери)
    // 2. И есть несохраненные изменения (hasUnsavedChanges)
    if (hasUnsavedChanges && (config.projectName || config.doors.length > 0)) {
      saveDraft(config);
      setLastSaved(new Date());
    }
  }, [config, hasUnsavedChanges]);
  
  // Обновление конфигурации (для передачи в дочерние компонентов)
  const updateConfig = useCallback((updates) => {
    setConfig(prev => ({ ...prev, ...updates }));
    setHasUnsavedChanges(true); // Отмечаем, что были изменения
  }, []);
  
  // Валидация конфигурации
  const validateCurrentConfig = useCallback(() => {
    return validateConfig(config);
  }, [config]);
  
  // Сохранение именованной конфигурации
  const handleSaveAs = useCallback(() => {
    const name = window.prompt('Введите имя конфигурации:');
    if (!name || name.trim().length === 0) return;
    
    const trimmedName = name.trim();
    if (saveNamedConfig(trimmedName, config)) {
      setSavedConfigsList(getSavedConfigsList());
      setCurrentConfigNameState(trimmedName);
      setCurrentConfigName(trimmedName);
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
      setHasUnsavedChanges(true); // Загруженная конфигурация считается измененной (не применена на контроллер)
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
        setHasUnsavedChanges(true); // Импортированная конфигурация считается измененной
        setSuccess('Конфигурация импортирована');
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        setError(`Ошибка импорта: ${err.message}`);
      }
    };
    input.click();
  }, []);
  
  // Применение конфигурации на контроллер
  const handleApplyToController = useCallback(async () => {
    // Валидация перед отправкой
    const validation = validateCurrentConfig();
    if (!validation.valid) {
      setError(`Ошибки валидации: ${validation.errors.join(', ')}`);
      return;
    }
    
    if (!window.confirm('Применить конфигурацию на контроллер? Это заменит текущую конфигурацию.')) {
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      // Преобразуем наш формат в формат для сервера
      const serverConfig = {
        formatVersion: config.formatVersion,
        seq: config.seq + 1, // Увеличиваем seq
        projectName: config.projectName,
        openTimeoutMs: config.openTimeoutMs,
        doors: config.doors.map(door => ({
          techId: door.techId,
          drawingId: door.drawingId || 0,
          nodeId: door.nodeId,
          localDoor: door.localDoor,
          type: door.typeCode || (door.type === 'NC' ? 0 : door.type === 'NO' ? 1 : 2),
          comment: door.comment || '',
        })),
        edges: config.edges.map(edge => ({
          srcGlobalDoorId: edge.srcGlobalDoorId,
          dstGlobalDoorId: edge.dstGlobalDoorId,
        })),
        postCloseTimeouts: config.postCloseTimeouts.map(t => t.timeoutMs),
        net: config.net,
      };
      
      await putConfigFull(serverConfig);
      
      // Очищаем черновик после успешного применения
      clearDraft();
      setHasUnsavedChanges(false); // Изменения применены, черновик больше не нужен
      setSuccess('Конфигурация успешно применена на контроллер');
      setTimeout(() => setSuccess(null), 3000);
      
      // Перезагружаем конфигурацию с сервера
      await loadConfigFromServer();
    } catch (err) {
      console.error('Ошибка применения конфигурации:', err);
      setError(`Ошибка применения: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [config, validateCurrentConfig, loadConfigFromServer]);
  
  const tabs = [
    { id: 'general', label: 'Общие параметры' },
    { id: 'doors', label: 'Двери' },
    { id: 'dependencies', label: 'Зависимости' },
    { id: 'timeouts', label: 'Таймауты' },
  ];
  
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
          {!hasUnsavedChanges && (
            <span className="auto-save-indicator" style={{ color: '#3c3' }}>
              ✓ Конфигурация синхронизирована с сервером
            </span>
          )}
        </div>
      </div>
      
      {/* Панель управления */}
      <div className="doors-config-toolbar">
        <div className="toolbar-left">
          <Button onClick={loadConfigFromServer} disabled={loading}>
            {loading ? 'Загрузка...' : '📥 Загрузить с сервера'}
          </Button>
          <Button onClick={handleSaveAs} variant="secondary">
            💾 Сохранить как...
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
            onClick={handleApplyToController} 
            variant="primary"
            disabled={saving || loading}
          >
            {saving ? 'Применение...' : '📤 Применить на контроллер'}
          </Button>
        </div>
      </div>
      
      {/* Список сохраненных конфигураций */}
      {savedConfigsList.length > 0 && (
        <div className="saved-configs-list">
          <h3>Сохраненные конфигурации:</h3>
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
        </div>
      )}
      
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
      
      {/* Вкладки */}
      <div className="doors-config-tabs">
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
