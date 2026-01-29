/**
 * Страница "Маппинг" - графический редактор карт помещений и дверей
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import MappingHeader from '../components/mapping/MappingHeader';
import MappingCanvas from '../components/mapping/MappingCanvas';
import MappingToolbar from '../components/mapping/MappingToolbar';
import { getDoors, getMapping, putMapping } from '../services/api';
import './Mapping.css';

const Mapping = () => {
  const pageRef = useRef(null);
  const canvasRef = useRef(null);
  const { user } = useContext(AuthContext);
  const [mode, setMode] = useState('edit'); // 'edit' | 'view'
  const [selectedTool, setSelectedTool] = useState('select'); // 'select' | 'wall' | 'door' | 'label' | 'comment'
  const [objects, setObjects] = useState([]);
  const [selectedObject, setSelectedObject] = useState(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1.0 });
  const [doors, setDoors] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapPoint, setSnapPoint] = useState(null);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [gridSize, setGridSize] = useState(5);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [projectName, setProjectName] = useState('');
  const [selectedDoorId, setSelectedDoorId] = useState(null);
  const [selectedDoorType, setSelectedDoorType] = useState('single'); // single | double | sliding | electric
  const [defaultWallThickness, setDefaultWallThickness] = useState(5);
  const [defaultDoorFlipH, setDefaultDoorFlipH] = useState(false);
  const [defaultDoorFlipV, setDefaultDoorFlipV] = useState(false);
  const [defaultDoorRotation, setDefaultDoorRotation] = useState(0);
  const [showDoorId, setShowDoorId] = useState(false);
  const [defaultDrawNumber, setDefaultDrawNumber] = useState('');
  const [defaultShowNumberOnDrawing, setDefaultShowNumberOnDrawing] = useState(false);

  // Определяем, может ли пользователь редактировать
  const canEdit = user?.role === 'admin' || user?.role === 'super_admin';

  // Загружаем данные о дверях; в режиме просмотра — обновляем каждые 3 сек
  useEffect(() => {
    const loadDoors = async () => {
      try {
        const doorsData = await getDoors();
        const list = Array.isArray(doorsData)
          ? doorsData
          : (doorsData?.doors || doorsData?.data || []);
        setDoors(Array.isArray(list) ? list : []);
      } catch (error) {
        if (mode !== 'view') console.error('Ошибка загрузки дверей:', error);
      }
    };
    loadDoors();
    if (mode === 'view') {
      const t = setInterval(loadDoors, 3000);
      return () => clearInterval(t);
    }
  }, [mode]);

  // Загрузка карты с сервера
  const loadMapping = useCallback(async () => {
    try {
      const data = await getMapping();
      if (data && data.objects) {
        setObjects(Array.isArray(data.objects) ? data.objects : []);
        if (data.viewport) setViewport({ x: data.viewport.x ?? 0, y: data.viewport.y ?? 0, zoom: data.viewport.zoom ?? 1 });
        if (data.projectName != null) setProjectName(data.projectName);
        setIsDirty(false);
      }
    } catch (err) {
      console.warn('Карта не загружена (возможно, ещё не сохранена):', err);
    }
  }, []);

  const handleLoad = useCallback(() => {
    loadMapping();
  }, [loadMapping]);

  // Обработка сохранения карты
  const handleSave = useCallback(async () => {
    try {
      const data = { version: 1, projectName, viewport, objects };
      await putMapping(data);
      setIsDirty(false);
    } catch (err) {
      console.error('Ошибка сохранения карты:', err);
      alert('Не удалось сохранить карту: ' + (err.message || 'ошибка сети'));
    }
  }, [objects, viewport, projectName]);

  // Загружаем карту при открытии страницы
  useEffect(() => {
    loadMapping();
  }, [loadMapping]);

  // Если пользователь не может редактировать, переключаемся в режим просмотра
  useEffect(() => {
    if (!canEdit) {
      setMode('view');
    }
  }, [canEdit]);

  // Обработка очистки карты
  const handleClear = useCallback(() => {
    if (window.confirm('Вы уверены, что хотите очистить карту?')) {
      setObjects([]);
      setIsDirty(true);
    }
  }, []);

  // Добавление объекта в историю для Undo/Redo
  const addToHistory = useCallback((newObjects) => {
    setHistory(prevHistory => {
      const newHistory = prevHistory.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(newObjects)));
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
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
        if (mode === 'edit' && selectedObject) {
          e.preventDefault();
          const newObjects = objects.filter(o => o.id !== selectedObject.id);
          handleObjectsChange(newObjects);
          setSelectedObject(null);
        }
      }
    };

    if (mode === 'edit') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [mode, handleUndo, handleRedo, selectedObject, objects, handleObjectsChange]);

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
      <MappingHeader
        projectName={projectName}
        mode={mode}
        onModeChange={setMode}
        canEdit={canEdit}
        onSave={handleSave}
        onLoad={handleLoad}
        onClear={handleClear}
        isDirty={isDirty}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onFitToView={() => canvasRef.current?.fitToView?.()}
      />
      <div className="mapping-content">
        <MappingCanvas
          ref={canvasRef}
          mode={mode}
          selectedTool={selectedTool}
          objects={objects}
          selectedObject={selectedObject}
          onObjectSelect={setSelectedObject}
          onObjectsChange={handleObjectsChange}
          onObjectChange={(obj) => {
            setSelectedObject(obj);
            handleObjectsChange(objects.map(o => o.id === obj.id ? obj : o));
          }}
          viewport={viewport}
          onViewportChange={setViewport}
          snapEnabled={snapEnabled}
          snapPoint={snapPoint}
          onSnapPointChange={setSnapPoint}
          gridEnabled={gridEnabled}
          gridSize={gridSize}
          doors={doors}
          selectedDoorId={selectedDoorId}
          selectedDoorType={selectedDoorType}
          defaultWallThickness={defaultWallThickness}
          defaultDoorFlipH={defaultDoorFlipH}
          defaultDoorFlipV={defaultDoorFlipV}
          defaultDoorRotation={defaultDoorRotation}
          showDoorId={showDoorId}
          defaultDrawNumber={defaultDrawNumber}
          defaultShowNumberOnDrawing={defaultShowNumberOnDrawing}
          onMoveEnd={(objs) => addToHistory(objs)}
        />
        {mode === 'edit' && (
          <MappingToolbar
            selectedTool={selectedTool}
            onToolSelect={setSelectedTool}
            selectedObject={selectedObject}
            onObjectChange={(obj) => {
              setSelectedObject(obj);
              const newObjects = objects.map(o => o.id === obj.id ? obj : o);
              handleObjectsChange(newObjects);
            }}
            onDelete={() => {
              if (selectedObject) {
                const newObjects = objects.filter(o => o.id !== selectedObject.id);
                handleObjectsChange(newObjects);
                setSelectedObject(null);
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
    </div>
  );
};

export default Mapping;
