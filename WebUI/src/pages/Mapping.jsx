/**
 * Страница "Маппинг" - графический редактор карт помещений и дверей
 */

import { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { AuthContext } from '../context/AuthContext';
import { useLeaveConfirm } from '../context/LeaveConfirmContext';
import MappingHeader from '../components/mapping/MappingHeader';
import MappingCanvas from '../components/mapping/MappingCanvas';
import MappingToolbar from '../components/mapping/MappingToolbar';
import Modal from '../components/common/Modal';
import { getDoors, getMapping, putMapping } from '../services/api';
import { FILE_PICKER_ID_MAPS } from '../constants/filePaths';
import './Mapping.css';

const Mapping = () => {
  const pageRef = useRef(null);
  const canvasRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { register, unregister } = useLeaveConfirm();
  const configBaseName = location.state?.configBaseName ?? '';

  const [mode, setMode] = useState('edit'); // 'edit' | 'view'
  const [selectedTool, setSelectedTool] = useState('select'); // 'select' | 'wall' | 'door' | 'label' | 'comment'
  const [objects, setObjects] = useState([]);
  const [selectedObjects, setSelectedObjects] = useState([]);
  const selectedObject = selectedObjects[0] ?? null;
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1.0 });
  const [doors, setDoors] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapPoint, setSnapPoint] = useState(null);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [gridSize, setGridSize] = useState(5);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [projectName, setProjectName] = useState(configBaseName || '');
  const [mapFileName, setMapFileName] = useState(''); // имя сохранённого/загруженного файла карты (для отображения и разрешения выгрузки в контроллер)
  const [selectedDoorId, setSelectedDoorId] = useState(null);
  const [selectedDoorType, setSelectedDoorType] = useState('single'); // single | double | sliding | electric
  const [defaultWallThickness, setDefaultWallThickness] = useState(5);
  const [selectedWallShape, setSelectedWallShape] = useState('segment'); // 'segment' | 'rectangle'
  const [defaultWallRectWidth, setDefaultWallRectWidth] = useState(100);
  const [defaultWallRectHeight, setDefaultWallRectHeight] = useState(50);
  const [defaultWallSegmentLength, setDefaultWallSegmentLength] = useState(100);
  const [defaultDoorLength, setDefaultDoorLength] = useState(null); // null = по умолчанию по типу (90/120)
  const [defaultDoorFlipH, setDefaultDoorFlipH] = useState(false);
  const [defaultDoorFlipV, setDefaultDoorFlipV] = useState(false);
  const [defaultDoorRotation, setDefaultDoorRotation] = useState(0);
  const [showDoorId, setShowDoorId] = useState(false);
  const [defaultDrawNumber, setDefaultDrawNumber] = useState('');
  const [defaultShowNumberOnDrawing, setDefaultShowNumberOnDrawing] = useState(false);
  const fileInputRef = useRef(null);
  const modalResolveRef = useRef(null);
  const savedFileHandleRef = useRef(null); // ручка файла после первого сохранения — повторное сохранение без диалога
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    type: 'confirm',
    title: '',
    message: '',
    confirmText: 'Да',
    cancelText: 'Нет',
    onConfirm: null,
    onCancel: null,
  });

  const [infoModal, setInfoModal] = useState({
    isOpen: false,
    title: '',
    message: '',
  });
  // Первый кадр в Просмотре — без данных дверей, чтобы переключение не блокировало UI; затем подставляем doors
  const [viewDoorsDeferred, setViewDoorsDeferred] = useState(false);

  // Синхронизация projectName с контекстом конфигурации при открытии из DoorsConfig
  useEffect(() => {
    if (configBaseName && !projectName) setProjectName(configBaseName);
  }, [configBaseName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Определяем, может ли пользователь редактировать
  const canEdit = user?.role === 'admin' || user?.role === 'super_admin';

  const mappingData = useCallback(
    () => ({ version: 1, projectName, viewport, objects }),
    [projectName, viewport, objects]
  );

  // Загружаем данные о дверях; в режиме просмотра — редкий опрос (20 с), без опроса при скрытой вкладке
  const loadDoors = useCallback(async () => {
    try {
      const doorsData = await getDoors();
      const list = Array.isArray(doorsData)
        ? doorsData
        : (doorsData?.doors || doorsData?.data || []);
      setDoors(Array.isArray(list) ? list : []);
    } catch (error) {
      if (mode !== 'view') console.error('Ошибка загрузки дверей:', error);
    }
  }, [mode]);

  // При переходе в Просмотр: первый кадр без doors (лёгкий рендер), затем в idle подставляем данные
  useEffect(() => {
    if (mode !== 'view') {
      setViewDoorsDeferred(false);
      loadDoors();
      return;
    }
    setViewDoorsDeferred(true);
    let raf1;
    let raf2;
    let idleOrTimeoutId;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (window.requestIdleCallback) {
          idleOrTimeoutId = window.requestIdleCallback(() => setViewDoorsDeferred(false), { timeout: 150 });
        } else {
          idleOrTimeoutId = setTimeout(() => setViewDoorsDeferred(false), 50);
        }
      });
    });
    return () => {
      if (raf1 != null) cancelAnimationFrame(raf1);
      if (raf2 != null) cancelAnimationFrame(raf2);
      if (window.cancelIdleCallback && typeof idleOrTimeoutId === 'number') window.cancelIdleCallback(idleOrTimeoutId);
      else if (typeof idleOrTimeoutId === 'number') clearTimeout(idleOrTimeoutId);
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'view') {
      loadDoors();
      return;
    }
    const VIEW_POLL_MS = 1000;    // 1 с — мгновенная реакция на открытие/закрытие дверей (контроллер не держит мьютекс при /api/doors)
    const VIEW_FIRST_DELAY_MS = 1000; // первый запрос через 1 с — переключение в Просмотр остаётся быстрым
    let intervalId = null;
    let firstId = null;
    const schedule = () => {
      if (document.hidden) return; // не опрашивать, когда вкладка в фоне
      firstId = setTimeout(() => {
        firstId = null;
        loadDoors();
        if (!document.hidden) {
          intervalId = setInterval(loadDoors, VIEW_POLL_MS);
        }
      }, VIEW_FIRST_DELAY_MS);
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (firstId) clearTimeout(firstId);
        firstId = null;
        if (intervalId) clearInterval(intervalId);
        intervalId = null;
      } else {
        schedule();
      }
    };
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (firstId) clearTimeout(firstId);
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [mode, loadDoors]);

  const showConfirm = useCallback((message, title = 'Подтвердите действие') => {
    return new Promise((resolve) => {
      modalResolveRef.current = resolve;
      flushSync(() => {
        setConfirmModal({
          isOpen: true,
          type: 'confirm',
          title,
          message,
          confirmText: 'Да',
          cancelText: 'Нет',
          onConfirm: () => {
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
            if (modalResolveRef.current) {
              modalResolveRef.current(true);
              modalResolveRef.current = null;
            }
          },
          onCancel: () => {
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
            if (modalResolveRef.current) {
              modalResolveRef.current(false);
              modalResolveRef.current = null;
            }
          },
        });
      });
    });
  }, []);

  const doLoadFromController = useCallback(async () => {
    try {
      const data = await getMapping();
      if (data && data.objects) {
        setObjects(Array.isArray(data.objects) ? data.objects : []);
        if (data.viewport) setViewport({ x: data.viewport.x ?? 0, y: data.viewport.y ?? 0, zoom: data.viewport.zoom ?? 1 });
        if (data.projectName != null) setProjectName(data.projectName);
        setIsDirty(false);
      } else {
        setObjects([]);
        setViewport({ x: 0, y: 0, zoom: 1 });
      }
      return { success: true };
    } catch (err) {
      console.error('Ошибка загрузки карты из контроллера:', err);
      alert('Не удалось загрузить карту из контроллера: ' + (err.message || 'ошибка сети'));
      return { success: false };
    }
  }, []);

  // Загрузка карты из контроллера (QSPI) — с подтверждением
  const handleLoadFromController = useCallback(async () => {
    const message =
      'Загружаемая карта заменит текущую карту, с которой вы работаете.\n\n' +
      'Рекомендуется сохранить изменения перед загрузкой (кнопка «Сохранить карту»).\n\n' +
      'Продолжить?';
    const confirmed = await showConfirm(message, 'Загрузить карту из контроллера');
    if (!confirmed) return;
    const result = await doLoadFromController();
    if (result?.success) {
      savedFileHandleRef.current = null; // карта из контроллера — следующее сохранение через диалог
      setInfoModal({ isOpen: true, title: 'Готово', message: 'Карта загружена из контроллера.' });
    }
  }, [showConfirm, doLoadFromController]);

  // Имя файла карты по соглашению: ИМЯ_map.json (как конфиг — ИМЯ_conf.json)
  const getDefaultMapFileName = useCallback(() => {
    const base = configBaseName || projectName || 'mapping';
    return base.endsWith('_map') ? base + '.json' : base + '_map.json';
  }, [configBaseName, projectName]);

  // Сохранение карты в файл на компьютере. Первое сохранение — диалог выбора места; повторное — в тот же файл без диалога.
  const handleSaveToFile = useCallback(async () => {
    const data = mappingData();
    const jsonStr = JSON.stringify(data, null, 2);
    const defaultName = getDefaultMapFileName();

    if (typeof window.showSaveFilePicker === 'function') {
      try {
        let handle = savedFileHandleRef.current;
        if (handle) {
          // Уже сохраняли ранее — пишем в тот же файл без диалога
          try {
            const writable = await handle.createWritable();
            await writable.write(jsonStr);
            await writable.close();
            setMapFileName(handle.name || defaultName);
            return true;
          } catch (writeErr) {
            // Права отозваны или файл удалён — открываем диалог заново
            savedFileHandleRef.current = null;
            handle = null;
          }
        }
        if (!handle) {
          handle = await window.showSaveFilePicker({
            suggestedName: defaultName,
            types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
            id: FILE_PICKER_ID_MAPS,
            startIn: 'documents',
          });
          savedFileHandleRef.current = handle;
          const writable = await handle.createWritable();
          await writable.write(jsonStr);
          await writable.close();
          setMapFileName(handle.name || defaultName);
          return true;
        }
      } catch (err) {
        if (err?.name === 'AbortError') return false;
        console.error('Ошибка сохранения файла:', err);
        alert('Не удалось сохранить файл: ' + (err.message || 'ошибка'));
        return false;
      }
    }

    // Fallback: скачивание в папку по умолчанию (повторное сохранение всё равно откроет диалог браузера)
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(url);
    setMapFileName(defaultName);
    return true;
  }, [mappingData, getDefaultMapFileName]);

  // Сохранить карту в файл и вернуться в редактор конфигурации. Если карта уже сохранена — без диалога; если изменений нет — просто выход.
  const handleSaveAndExit = useCallback(async () => {
    if (savedFileHandleRef.current && !isDirty) {
      navigate('/configuration/doors', { state: { openConfigName: configBaseName } });
      return;
    }
    const saved = await handleSaveToFile();
    if (saved) {
      navigate('/configuration/doors', { state: { openConfigName: configBaseName } });
    }
  }, [handleSaveToFile, navigate, configBaseName, isDirty]);

  // Выход из маппинга без сохранения. При несохранённых изменениях — предупреждение.
  const handleCancelExit = useCallback(async () => {
    if (isDirty) {
      const confirmed = await showConfirm(
        'В карте маппинга есть несохранённые изменения. Выйти без сохранения?',
        'Выход из маппинга'
      );
      if (!confirmed) return;
    }
    navigate('/configuration/doors', { state: { openConfigName: configBaseName } });
  }, [isDirty, showConfirm, navigate, configBaseName]);

  // Загрузка карты из файла с компьютера
  const triggerLoadFromFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data && Array.isArray(data.objects)) {
          setObjects(data.objects);
          if (data.viewport) setViewport({ x: data.viewport.x ?? 0, y: data.viewport.y ?? 0, zoom: data.viewport.zoom ?? 1 });
          if (data.projectName != null) setProjectName(data.projectName);
          setMapFileName(file.name);
          savedFileHandleRef.current = null; // загрузили из другого файла — следующее сохранение через диалог
          setIsDirty(false);
        } else {
          alert('Неверный формат файла карты.');
        }
      } catch (err) {
        alert('Ошибка чтения файла: ' + (err.message || 'неверный JSON'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  // Выгрузка карты в контроллер (QSPI) — с подтверждением
  const handleUploadToController = useCallback(async () => {
    const message =
      'Текущая карта будет записана в контроллер (QSPI).\n\n' +
      'Карта в контроллере будет заменена. Продолжить?';
    const confirmed = await showConfirm(message, 'Выгрузить карту в контроллер');
    if (!confirmed) return;
    try {
      const data = mappingData();
      await putMapping(data);
      setIsDirty(false);
      setInfoModal({ isOpen: true, title: 'Готово', message: 'Карта выгружена в контроллер.' });
    } catch (err) {
      console.error('Ошибка выгрузки карты в контроллер:', err);
      alert('Не удалось выгрузить карту в контроллер: ' + (err.message || 'ошибка сети'));
    }
  }, [mappingData, showConfirm]);

  // Если пользователь не может редактировать, переключаемся в режим просмотра
  useEffect(() => {
    if (!canEdit) {
      setMode('view');
    }
  }, [canEdit]);

  // Регистрация проверки несохранённых изменений при уходе со страницы (другая вкладка/страница)
  const MAPPING_PATH = '/configuration/mapping';
  useEffect(() => {
    register(MAPPING_PATH, () => isDirty);
    return () => unregister(MAPPING_PATH);
  }, [register, unregister, isDirty]);

  // Обработка очистки карты (модальное подтверждение)
  const handleClear = useCallback(async () => {
    const confirmed = await showConfirm(
      'Вся текущая карта будет удалена. Это действие нельзя отменить.\n\nПродолжить?',
      'Очистить карту'
    );
    if (!confirmed) return;
    setObjects([]);
    setMapFileName('');
    setIsDirty(true);
  }, [showConfirm]);

  // Добавление объекта в историю для Undo/Redo (не вызывать setState внутри другого setState)
  const addToHistory = useCallback((newObjects) => {
    let snapshot;
    try {
      snapshot = JSON.parse(JSON.stringify(newObjects));
    } catch (_) {
      return;
    }
    const nextIndex = historyIndex + 1;
    setHistory(prevHistory => {
      const newHistory = prevHistory.slice(0, nextIndex);
      newHistory.push(snapshot);
      return newHistory;
    });
    setHistoryIndex(nextIndex);
  }, [historyIndex]);

  // Undo
  const handleUndo = useCallback(() => {
    setHistoryIndex(prevIndex => {
      if (prevIndex > 0) {
        const newIndex = prevIndex - 1;
        setObjects(JSON.parse(JSON.stringify(history[newIndex])));
        setIsDirty(true);
        return newIndex;
      }
      return prevIndex;
    });
  }, [history]);

  // Redo
  const handleRedo = useCallback(() => {
    setHistoryIndex(prevIndex => {
      if (prevIndex < history.length - 1) {
        const newIndex = prevIndex + 1;
        setObjects(JSON.parse(JSON.stringify(history[newIndex])));
        setIsDirty(true);
        return newIndex;
      }
      return prevIndex;
    });
  }, [history]);

  // Обработка изменения объектов (addToHistory: false при перетаскивании)
  const handleObjectsChange = useCallback((newObjects, opts) => {
    setObjects(newObjects);
    setIsDirty(true);
    if (opts?.addToHistory !== false) addToHistory(newObjects);
  }, [addToHistory]);

  const handleCanvasObjectChange = useCallback((obj) => {
    const existing = objects.find(o => o.id === obj.id);
    const merged = existing ? { ...existing, ...obj } : obj;
    setSelectedObjects(prev => prev.map(p => p.id === merged.id ? merged : p));
    handleObjectsChange(objects.map(o => o.id === merged.id ? merged : o));
  }, [objects, handleObjectsChange]);

  // Вставка комментария: добавляем в список и сразу выбираем (панель свойств открывается)
  const handleAddComment = useCallback((newComment) => {
    const next = [...objectsRef.current, newComment];
    setObjects(next);
    setIsDirty(true);
    addToHistory(next);
    flushSync(() => setSelectedObjects([newComment]));
  }, [addToHistory]);

  const handleCanvasMoveEnd = useCallback((objs) => {
    addToHistory(objs);
    setSelectedObjects(prev => prev.map(p => objs.find(o => o.id === p.id) ?? p));
  }, [addToHistory]);

  // Инициализация истории при первой загрузке
  useEffect(() => {
    if (history.length === 0 && objects.length === 0) {
      setHistory([[]]);
      setHistoryIndex(0);
    }
  }, []);

  // Горячие клавиши: Undo/Redo и Delete
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const active = document.activeElement;
        // Не удалять объект при редактировании текста: в инлайн-редакторе на карте И в поле «Текст» в панели свойств (тулбар)
        const isEditingText = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
        if (mode === 'edit' && selectedObjects.length > 0 && !isEditingText) {
          e.preventDefault();
          const ids = new Set(selectedObjects.map(o => o.id));
          handleObjectsChange(objects.filter(o => !ids.has(o.id)));
          setSelectedObjects([]);
        }
      }
    };

    if (mode === 'edit') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [mode, handleUndo, handleRedo, selectedObjects, objects, handleObjectsChange]);

  // Блокируем прокрутку страницы колесом (passive: false нужен для preventDefault)
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.target.closest('.mapping-canvas-container')) return;
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  return (
    <div ref={pageRef} className="mapping-page">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />
      <MappingHeader
        mapDisplayName={mapFileName || projectName || 'Без имени'}
        onSaveAndExit={handleSaveAndExit}
        onCancelExit={handleCancelExit}
        mode={mode}
        onModeChange={(m) => {
          if (m === 'view') startTransition(() => setMode(m));
          else setMode(m);
        }}
        canEdit={canEdit}
        onSaveToFile={handleSaveToFile}
        onLoadFromFile={triggerLoadFromFile}
        onUploadToController={handleUploadToController}
        onLoadFromController={handleLoadFromController}
        onClear={handleClear}
        canUploadToController={!!mapFileName}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onFitToView={() => canvasRef.current?.fitToView?.()}
        onRefreshDoors={mode === 'view' ? loadDoors : undefined}
      />
      <div className="mapping-content">
        <MappingCanvas
          ref={canvasRef}
          mode={mode}
          selectedTool={selectedTool}
          objects={objects}
          selectedObject={selectedObject}
          selectedObjects={Array.isArray(selectedObjects) ? selectedObjects : []}
          onObjectSelect={(obj) => setSelectedObjects(obj ? [obj] : [])}
          onObjectsSelect={setSelectedObjects}
          onObjectsChange={handleObjectsChange}
          onObjectChange={handleCanvasObjectChange}
          onAddComment={handleAddComment}
          viewport={viewport}
          onViewportChange={setViewport}
          snapEnabled={snapEnabled}
          snapPoint={snapPoint}
          onSnapPointChange={setSnapPoint}
          gridEnabled={gridEnabled}
          gridSize={gridSize}
          doors={mode === 'view' && viewDoorsDeferred ? [] : doors}
          selectedDoorId={selectedDoorId}
          selectedDoorType={selectedDoorType}
          defaultWallThickness={defaultWallThickness}
          defaultDoorLength={defaultDoorLength}
          defaultDoorFlipH={defaultDoorFlipH}
          defaultDoorFlipV={defaultDoorFlipV}
          defaultDoorRotation={defaultDoorRotation}
          showDoorId={showDoorId}
          defaultDrawNumber={defaultDrawNumber}
          defaultShowNumberOnDrawing={defaultShowNumberOnDrawing}
          onMoveEnd={handleCanvasMoveEnd}
          wallShape={selectedWallShape}
        />
        {mode === 'edit' && (
          <MappingToolbar
            selectedTool={selectedTool}
            onToolSelect={(toolId) => {
              setSelectedTool(toolId);
              setSelectedObjects([]);
            }}
            selectedObject={selectedObject}
            selectedObjects={Array.isArray(selectedObjects) ? selectedObjects : []}
            onObjectChange={(obj) => {
              const existing = objects.find(o => o.id === obj.id);
              const merged = existing ? { ...existing, ...obj } : obj;
              setSelectedObjects(prev => prev.map(p => p.id === merged.id ? merged : p));
              handleObjectsChange(objects.map(o => o.id === merged.id ? merged : o));
            }}
            onDelete={() => {
              if (selectedObjects.length > 0) {
                const ids = new Set(selectedObjects.map(o => o.id));
                handleObjectsChange(objects.filter(o => !ids.has(o.id)));
                setSelectedObjects([]);
              }
            }}
            snapEnabled={snapEnabled}
            onSnapEnabledChange={setSnapEnabled}
            gridEnabled={gridEnabled}
            onGridEnabledChange={setGridEnabled}
            gridSize={gridSize}
            onGridSizeChange={setGridSize}
            doors={doors}
            selectedDoorId={selectedDoorId}
            onSelectedDoorIdChange={setSelectedDoorId}
            selectedDoorType={selectedDoorType}
            onSelectedDoorTypeChange={setSelectedDoorType}
            defaultWallThickness={defaultWallThickness}
            onDefaultWallThicknessChange={setDefaultWallThickness}
            wallShape={selectedWallShape}
            onWallShapeChange={setSelectedWallShape}
            defaultWallRectWidth={defaultWallRectWidth}
            defaultWallRectHeight={defaultWallRectHeight}
            onDefaultWallRectWidthChange={setDefaultWallRectWidth}
            onDefaultWallRectHeightChange={setDefaultWallRectHeight}
            defaultWallSegmentLength={defaultWallSegmentLength}
            onDefaultWallSegmentLengthChange={setDefaultWallSegmentLength}
            defaultDoorLength={defaultDoorLength}
            onDefaultDoorLengthChange={setDefaultDoorLength}
            defaultDoorFlipH={defaultDoorFlipH}
            defaultDoorFlipV={defaultDoorFlipV}
            defaultDoorRotation={defaultDoorRotation}
            onDefaultDoorFlipHChange={setDefaultDoorFlipH}
            onDefaultDoorFlipVChange={setDefaultDoorFlipV}
            onDefaultDoorRotationChange={setDefaultDoorRotation}
            showDoorId={showDoorId}
            onShowDoorIdChange={setShowDoorId}
            defaultDrawNumber={defaultDrawNumber}
            defaultShowNumberOnDrawing={defaultShowNumberOnDrawing}
            onDefaultDrawNumberChange={setDefaultDrawNumber}
            onDefaultShowNumberOnDrawingChange={setDefaultShowNumberOnDrawing}
          />
        )}
      </div>
      <Modal
        isOpen={confirmModal.isOpen}
        type={confirmModal.type}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        onConfirm={confirmModal.onConfirm}
        onCancel={confirmModal.onCancel}
      />
      <Modal
        isOpen={infoModal.isOpen}
        type="confirm"
        title={infoModal.title}
        message={infoModal.message}
        confirmText="Понятно"
        singleButton
        onConfirm={() => setInfoModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default Mapping;
