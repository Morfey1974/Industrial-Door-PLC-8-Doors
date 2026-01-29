/**
 * SVG Canvas для рисования карты
 */

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import './MappingCanvas.css';

const DOOR_WIDTH = 60;
const DOOR_HEIGHT = 10;

// Точка пересечения двух отрезков (x1,y1)-(x2,y2) и (x3,y3)-(x4,y4)
function lineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-10) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  }
  return null;
}

const MappingCanvas = forwardRef(({
  mode,
  selectedTool,
  objects,
  selectedObject,
  onObjectSelect,
  onObjectsChange,
  onObjectChange,
  viewport,
  onViewportChange,
  snapEnabled,
  snapPoint,
  onSnapPointChange,
  gridEnabled,
  gridSize,
  doors,
  selectedDoorId,
  selectedDoorType,
  defaultWallThickness,
  defaultDoorFlipH,
  defaultDoorFlipV,
  defaultDoorRotation,
  showDoorId,
  defaultDrawNumber,
  defaultShowNumberOnDrawing,
  onMoveEnd,
}, ref) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingStart, setDrawingStart] = useState(null);
  const [currentMousePos, setCurrentMousePos] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);
  const [isMovingObject, setIsMovingObject] = useState(false);
  const [moveStart, setMoveStart] = useState(null);
  const [isResizingDoor, setIsResizingDoor] = useState(false);
  const [resizeHandle, setResizeHandle] = useState(null);
  const [resizeStart, setResizeStart] = useState(null);
  const lastMovedObjectsRef = useRef(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const commentInputRef = useRef(null);

  const DOOR_HANDLE_SIZE = 8;
  const MIN_DOOR_SIZE = 12;
  const LEAF_WIDTH_RATIO = 0.35; // для раздвижной: панель = 0.35 от проёма
  const DOUBLE_LEAF_MAIN_RATIO = 0.6; // двустворчатая: основная (открывающаяся) створка 60%, вторая 40%

  // Границы: для single/electric — одна створка; для double — весь проём (маркеры по углам двери); для sliding — панель
  const getDoorLeafBounds = useCallback((o) => {
    const w = o.width || DOOR_WIDTH;
    const h = o.height || DOOR_HEIGHT;
    const type = o.doorType || 'single';
    let leafX, leafY, leafW;
    if (type === 'single' || type === 'electric') {
      leafX = o.x;
      leafY = o.y;
      leafW = w;
    } else if (type === 'sliding') {
      leafX = o.x + w * 0.1;
      leafY = o.y;
      leafW = w * LEAF_WIDTH_RATIO;
    } else {
      // double: маркеры по углам всего проёма (x, y) — (x+w, y+h)
      leafX = o.x;
      leafY = o.y;
      leafW = w;
    }
    return { leafX, leafY, leafW, leafH: h };
  }, []);

  // Получение координат мыши в мировой системе (контейнер канваса = система координат экрана)
  const getSVGPoint = useCallback((clientX, clientY) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const zoom = viewport.zoom;
    return {
      x: viewport.x + sx / zoom,
      y: viewport.y + sy / zoom,
    };
  }, [viewport.x, viewport.y, viewport.zoom]);

  const SNAP_TOLERANCE = 15; // расстояние привязки в мировых единицах (мм)

  // Поиск ближайшей точки привязки (приоритет: пересечения > концы линий > центры объектов > сетка)
  const findSnapPoint = useCallback((x, y) => {
    if (!snapEnabled) return null;

    let nearestPoint = null;
    let minDistance = SNAP_TOLERANCE;
    const walls = objects.filter(o => o.type === 'wall');

    // Пересечения линий
    for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        const w1 = walls[i], w2 = walls[j];
        const p = lineIntersection(w1.x1, w1.y1, w1.x2, w1.y2, w2.x1, w2.y1, w2.x2, w2.y2);
        if (p) {
          const d = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
          if (d < minDistance) {
            minDistance = d;
            nearestPoint = p;
          }
        }
      }
    }

    // Концы линий
    walls.forEach(obj => {
      const dist1 = Math.sqrt((x - obj.x1) ** 2 + (y - obj.y1) ** 2);
      const dist2 = Math.sqrt((x - obj.x2) ** 2 + (y - obj.y2) ** 2);
      if (dist1 < minDistance) { minDistance = dist1; nearestPoint = { x: obj.x1, y: obj.y1 }; }
      if (dist2 < minDistance) { minDistance = dist2; nearestPoint = { x: obj.x2, y: obj.y2 }; }
    });

    // Центры объектов
    objects.forEach(obj => {
      if (obj.type === 'door' || obj.type === 'label' || obj.type === 'comment') {
        const centerX = obj.x + (obj.width || DOOR_WIDTH) / 2;
        const centerY = obj.y + (obj.height || obj.type === 'door' ? DOOR_HEIGHT : 14) / 2;
        const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        if (dist < minDistance) { minDistance = dist; nearestPoint = { x: centerX, y: centerY }; }
      }
    });

    // Сетка
    if (gridEnabled) {
      const gridX = Math.round(x / gridSize) * gridSize;
      const gridY = Math.round(y / gridSize) * gridSize;
      const dist = Math.sqrt((x - gridX) ** 2 + (y - gridY) ** 2);
      if (dist < minDistance) nearestPoint = { x: gridX, y: gridY };
    }

    return nearestPoint;
  }, [snapEnabled, objects, gridEnabled, gridSize]);

  // Преобразование мировых координат в локальные двери (учёт поворота и отражения)
  const worldToDoorLocal = useCallback((obj, worldX, worldY) => {
    const w = obj.width || DOOR_WIDTH;
    const h = obj.height || DOOR_HEIGHT;
    const cx = obj.x + w / 2;
    const cy = obj.y + h / 2;
    const rotation = ((obj.rotation ?? 0) % 360) * (Math.PI / 180);
    const sx = obj.flipH ? -1 : 1;
    const sy = obj.flipV ? -1 : 1;
    const u = worldX - cx;
    const v = worldY - cy;
    const localX = cx + (Math.cos(rotation) * u + Math.sin(rotation) * v) / sx;
    const localY = cy + (-Math.sin(rotation) * u + Math.cos(rotation) * v) / sy;
    return { localX, localY };
  }, []);

  // Проверка попадания в ручку изменения размера двери (углы створки leaf в локальных координатах)
  const hitTestResizeHandle = useCallback((worldX, worldY) => {
    if (!selectedObject || selectedObject.type !== 'door') return null;
    const o = objects.find(obj => obj.id === selectedObject.id) || selectedObject;
    const { localX, localY } = worldToDoorLocal(o, worldX, worldY);
    const { leafX, leafY, leafW, leafH } = getDoorLeafBounds(o);
    const r = DOOR_HANDLE_SIZE / 2;
    if (localX >= leafX + leafW - r && localX <= leafX + leafW + r && localY >= leafY + leafH - r && localY <= leafY + leafH + r) return 'se';
    if (localX >= leafX - r && localX <= leafX + r && localY >= leafY + leafH - r && localY <= leafY + leafH + r) return 'sw';
    if (localX >= leafX + leafW - r && localX <= leafX + leafW + r && localY >= leafY - r && localY <= leafY + r) return 'ne';
    if (localX >= leafX - r && localX <= leafX + r && localY >= leafY - r && localY <= leafY + r) return 'nw';
    return null;
  }, [selectedObject, objects, worldToDoorLocal, getDoorLeafBounds]);

  // Обработка движения мыши
  const handleMouseMove = useCallback((e) => {
    const svgPoint = getSVGPoint(e.clientX, e.clientY);
    if (!svgPoint) return;

    // Панорамирование (правая кнопка мыши или зажатый пробел)
    if (isPanning && panStart) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      onViewportChange({
        ...viewport,
        x: viewport.x - dx / viewport.zoom,
        y: viewport.y - dy / viewport.zoom,
      });
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // Панорамирование (старый способ)
    if (isDragging && dragStart) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      onViewportChange({
        ...viewport,
        x: viewport.x + dx / viewport.zoom,
        y: viewport.y + dy / viewport.zoom,
      });
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // Изменение размера двери за углы створки (leaf); из новых границ leaf получаем door (x,y,w,h)
    if (isResizingDoor && resizeStart && resizeHandle) {
      const { obj, x, y, w, h } = resizeStart;
      const type = obj.doorType || 'single';
      const mx = svgPoint.x;
      const my = svgPoint.y;
      const { localX, localY } = worldToDoorLocal(obj, mx, my);
      const { leafX, leafY, leafW: prevLeafW, leafH: prevLeafH } = getDoorLeafBounds(obj);
      let newX = x, newY = y, newW = w, newH = h;

      // double: маркеры по углам всего проёма (как single); single/sliding/electric — по створке
      if (type !== 'double') {
        // single / electric: leafW = w (длина створки = ширина двери); sliding: leafW = w * LEAF_WIDTH_RATIO
        const isSliding = type === 'sliding';
        const newLeafWFromRight = (v) => (isSliding ? Math.max(MIN_DOOR_SIZE * LEAF_WIDTH_RATIO, v) / LEAF_WIDTH_RATIO : Math.max(MIN_DOOR_SIZE, v));
        const newLeafWFromLeft = (v) => (isSliding ? Math.max(MIN_DOOR_SIZE * LEAF_WIDTH_RATIO, v) / LEAF_WIDTH_RATIO : Math.max(MIN_DOOR_SIZE, v));
        if (resizeHandle === 'se') {
          newX = x;
          newY = y;
          newW = newLeafWFromRight(localX - x);
          newH = Math.max(MIN_DOOR_SIZE, localY - y);
        } else if (resizeHandle === 'sw') {
          newX = localX;
          newY = y;
          newW = newLeafWFromLeft((x + prevLeafW) - localX);
          newH = Math.max(MIN_DOOR_SIZE, localY - y);
        } else if (resizeHandle === 'ne') {
          newX = x;
          newY = localY;
          newW = newLeafWFromRight(localX - x);
          newH = Math.max(MIN_DOOR_SIZE, (y + h) - localY);
        } else {
          newX = localX;
          newY = localY;
          newW = newLeafWFromLeft((x + prevLeafW) - localX);
          newH = Math.max(MIN_DOOR_SIZE, (y + h) - localY);
        }
      } else {
        // double: ресайз по углам всего проёма (leafX=x, leafW=w)
        if (resizeHandle === 'se') {
          newX = x;
          newY = y;
          newW = Math.max(MIN_DOOR_SIZE, localX - x);
          newH = Math.max(MIN_DOOR_SIZE, localY - y);
        } else if (resizeHandle === 'sw') {
          newX = localX;
          newY = y;
          newW = Math.max(MIN_DOOR_SIZE, (x + w) - localX);
          newH = Math.max(MIN_DOOR_SIZE, localY - y);
        } else if (resizeHandle === 'ne') {
          newX = x;
          newY = localY;
          newW = Math.max(MIN_DOOR_SIZE, localX - x);
          newH = Math.max(MIN_DOOR_SIZE, (y + h) - localY);
        } else {
          newX = localX;
          newY = localY;
          newW = Math.max(MIN_DOOR_SIZE, (x + w) - localX);
          newH = Math.max(MIN_DOOR_SIZE, (y + h) - localY);
        }
      }

      const next = objects.map(o =>
        o.id === obj.id ? { ...o, x: newX, y: newY, width: newW, height: newH } : o
      );
      onObjectsChange(next, { addToHistory: false });
      return;
    }

    // Перемещение объекта (без добавления в историю на каждый кадр)
    if (isMovingObject && moveStart && selectedObject) {
      const dx = (e.clientX - moveStart.clientX) / viewport.zoom;
      const dy = (e.clientY - moveStart.clientY) / viewport.zoom;
      const obj = selectedObject;
      const noHistory = { addToHistory: false };
      let next;
      if (obj.type === 'wall') {
        next = objects.map(o =>
          o.id === obj.id
            ? { ...o, x1: moveStart.objX1 + dx, y1: moveStart.objY1 + dy, x2: moveStart.objX2 + dx, y2: moveStart.objY2 + dy }
            : o
        );
      } else if (obj.type === 'door') {
        next = objects.map(o =>
          o.id === obj.id ? { ...o, x: moveStart.objX + dx, y: moveStart.objY + dy } : o
        );
      } else {
        next = objects.map(o =>
          o.id === obj.id ? { ...o, x: moveStart.objX + dx, y: moveStart.objY + dy } : o
        );
      }
      lastMovedObjectsRef.current = next;
      onObjectsChange(next, noHistory);
      return;
    }

    // Рисование стены
    if (isDrawing && drawingStart && selectedTool === 'wall') {
      let endPoint = svgPoint;
      const snap = findSnapPoint(svgPoint.x, svgPoint.y);
      if (snap) {
        endPoint = snap;
        onSnapPointChange(snap);
      } else {
        onSnapPointChange(null);
      }
      setCurrentMousePos(endPoint);
    } else {
      // В режиме «Выбор» точка привязки не используется — выбор только курсором
      if (selectedTool === 'select') {
        onSnapPointChange(null);
      } else {
        const snap = findSnapPoint(svgPoint.x, svgPoint.y);
        onSnapPointChange(snap);
      }
      setCurrentMousePos(svgPoint);
    }
  }, [
    getSVGPoint,
    isPanning,
    panStart,
    isDragging,
    dragStart,
    isResizingDoor,
    resizeStart,
    resizeHandle,
    isMovingObject,
    moveStart,
    selectedObject,
    objects,
    viewport,
    onViewportChange,
    onObjectsChange,
    isDrawing,
    drawingStart,
    selectedTool,
    findSnapPoint,
    onSnapPointChange,
    worldToDoorLocal,
    getDoorLeafBounds,
  ]);

  // Поиск объекта под курсором (сверху вниз по массиву)
  const hitTest = useCallback((x, y) => {
    const tolerance = 8;
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      if (o.type === 'wall') {
        const thickness = (o.thickness || 5) / 2;
        const dx = o.x2 - o.x1, dy = o.y2 - o.y1;
        const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const t = Math.max(0, Math.min(1, ((x - o.x1) * dx + (y - o.y1) * dy) / (len * len)));
        const px = o.x1 + t * dx, py = o.y1 + t * dy;
        if (Math.sqrt((x - px) ** 2 + (y - py) ** 2) <= thickness + tolerance) return o;
      }
      if (o.type === 'door') {
        const { localX, localY } = worldToDoorLocal(o, x, y);
        const w = o.width || DOOR_WIDTH;
        const h = o.height || DOOR_HEIGHT;
        const type = o.doorType || 'single';
        let hitMinX, hitMinY, hitMaxX, hitMaxY;
        if (type === 'double') {
          const leftLeafW = w * DOUBLE_LEAF_MAIN_RATIO;
          const rightLeafW = w * (1 - DOUBLE_LEAF_MAIN_RATIO);
          hitMinX = o.x;
          hitMaxX = o.x + w;
          hitMinY = o.y - Math.max(leftLeafW, rightLeafW);
          hitMaxY = o.y + h;
        } else {
          const { leafX, leafY, leafW, leafH } = getDoorLeafBounds(o);
          hitMinX = leafX - leafW;
          hitMinY = leafY - leafW;
          hitMaxX = leafX + leafW;
          hitMaxY = leafY + leafH;
        }
        if (localX >= hitMinX - tolerance && localX <= hitMaxX + tolerance && localY >= hitMinY - tolerance && localY <= hitMaxY + tolerance) return o;
      }
      if (o.type === 'label' || o.type === 'comment') {
        const w = 60;
        const h = (o.fontSize || 12) + 4;
        if (x >= o.x - tolerance && x <= o.x + w + tolerance && y >= o.y - tolerance && y <= o.y + h + tolerance) return o;
      }
    }
    return null;
  }, [objects, worldToDoorLocal, getDoorLeafBounds]);

  // Обработка клика мыши
  const handleMouseDown = useCallback((e) => {
    const svgPoint = getSVGPoint(e.clientX, e.clientY);
    if (!svgPoint) return;

    // Панорамирование при перетаскивании колёсиком мыши (средняя кнопка) — зафиксировано как правильное
    if (e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (e.button !== 0) return;

    // Инструмент «Вид» — только настройки привязки/сетки, клик по канвасу ничего не делает
    if (selectedTool === 'view') return;

    const pt = findSnapPoint(svgPoint.x, svgPoint.y) || svgPoint;

    // Выбор и перемещение (или ресайз двери за углы)
    if (selectedTool === 'select' && mode === 'edit') {
      const handle = hitTestResizeHandle(svgPoint.x, svgPoint.y);
      if (handle && selectedObject?.type === 'door') {
        e.stopPropagation();
        setIsResizingDoor(true);
        setResizeHandle(handle);
        setResizeStart({
          obj: selectedObject,
          worldX: svgPoint.x,
          worldY: svgPoint.y,
          x: selectedObject.x,
          y: selectedObject.y,
          w: selectedObject.width || DOOR_WIDTH,
          h: selectedObject.height || DOOR_HEIGHT,
        });
        return;
      }
      const hit = hitTest(svgPoint.x, svgPoint.y);
      if (hit) {
        onObjectSelect(hit);
        if (hit.type !== 'comment') {
          setMoveStart({
            clientX: e.clientX,
            clientY: e.clientY,
            objX: hit.x,
            objY: hit.y,
            objX1: hit.x1,
            objY1: hit.y1,
            objX2: hit.x2,
            objY2: hit.y2,
          });
          setIsMovingObject(true);
        }
      } else {
        onObjectSelect(null);
      }
      return;
    }

    // Рисование стены
    if (selectedTool === 'wall' && mode === 'edit') {
      if (!isDrawing) {
        setIsDrawing(true);
        setDrawingStart(pt);
      } else {
        const newWall = {
          id: `wall_${Date.now()}`,
          type: 'wall',
          x1: drawingStart.x,
          y1: drawingStart.y,
          x2: pt.x,
          y2: pt.y,
          thickness: defaultWallThickness ?? 5,
          color: '#333333',
        };
        onObjectsChange([...objects, newWall]);
        onObjectSelect(newWall);
        setIsDrawing(false);
        setDrawingStart(null);
      }
      return;
    }

    // Вставка двери
    if (selectedTool === 'door' && mode === 'edit') {
      const gid = selectedDoorId != null ? selectedDoorId : (doors && doors[0] ? (doors[0].id ?? doors[0].doorId ?? doors[0].globalDoorId) : undefined);
      const doorId = `door_${Date.now()}`;
      const x = pt.x - DOOR_WIDTH / 2;
      const y = pt.y - DOOR_HEIGHT / 2;
      const newObjects = [...objects,
        {
          id: doorId,
          type: 'door',
          x,
          y,
          width: DOOR_WIDTH,
          height: DOOR_HEIGHT,
          globalDoorId: gid ?? 0,
          doorType: selectedDoorType || 'single',
          flipH: defaultDoorFlipH ?? false,
          flipV: defaultDoorFlipV ?? false,
          rotation: defaultDoorRotation ?? 0,
          drawNumber: defaultDrawNumber ?? '',
          showNumberOnDrawing: defaultShowNumberOnDrawing ?? false,
        },
      ];
      onObjectsChange(newObjects);
      onObjectSelect(newObjects[newObjects.length - 1]);
      return;
    }

    // Вставка номера/метки
    if (selectedTool === 'label' && mode === 'edit') {
      onObjectsChange([...objects, { id: `label_${Date.now()}`, type: 'label', x: pt.x, y: pt.y, text: '№', fontSize: 12 }]);
      return;
    }

    // Вставка комментария
    if (selectedTool === 'comment' && mode === 'edit') {
      onObjectsChange([...objects, { id: `comment_${Date.now()}`, type: 'comment', x: pt.x, y: pt.y, text: 'Текст', fontSize: 14 }]);
      return;
    }
  }, [
    getSVGPoint,
    selectedTool,
    mode,
    isDrawing,
    drawingStart,
    findSnapPoint,
    objects,
    onObjectsChange,
    onObjectSelect,
    selectedDoorId,
    selectedDoorType,
    doors,
    defaultWallThickness,
    defaultDoorFlipH,
    defaultDoorFlipV,
    defaultDoorRotation,
    defaultDrawNumber,
    defaultShowNumberOnDrawing,
    hitTest,
    hitTestResizeHandle,
    selectedObject,
  ]);

  // Обработка отпускания мыши
  const handleMouseUp = useCallback(() => {
    if (isMovingObject && onMoveEnd && lastMovedObjectsRef.current) {
      onMoveEnd(lastMovedObjectsRef.current);
      lastMovedObjectsRef.current = null;
    }
    setIsDragging(false);
    setDragStart(null);
    setIsPanning(false);
    setPanStart(null);
    setIsMovingObject(false);
    setMoveStart(null);
    setIsResizingDoor(false);
    setResizeHandle(null);
    setResizeStart(null);
  }, [isMovingObject, onMoveEnd]);

  // Обработка контекстного меню (отключение для правой кнопки мыши)
  const handleContextMenu = useCallback((e) => {
    if (isPanning) {
      e.preventDefault();
    }
  }, [isPanning]);

  // Зум колесиком мыши: центр масштабирования — перекрестие курсора (точка под курсором остаётся на месте)
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5.0, viewport.zoom * delta));
    const worldUnderCursor = getSVGPoint(e.clientX, e.clientY);
    if (worldUnderCursor) {
      onViewportChange({
        x: worldUnderCursor.x - (worldUnderCursor.x - viewport.x) * viewport.zoom / newZoom,
        y: worldUnderCursor.y - (worldUnderCursor.y - viewport.y) * viewport.zoom / newZoom,
        zoom: newZoom,
      });
    }
  }, [viewport, getSVGPoint, onViewportChange]);

  // Обработчик wheel с passive: false, чтобы preventDefault работал (браузер иначе игнорирует)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // При выборе комментария инструментом «Выбор» — войти в режим редактирования текста в канвасе
  useEffect(() => {
    if (selectedTool === 'select' && mode === 'edit' && selectedObject?.type === 'comment') {
      setEditingCommentId(selectedObject.id);
    } else {
      setEditingCommentId(null);
    }
  }, [selectedTool, mode, selectedObject?.id, selectedObject?.type]);

  // Фокус в поле комментария и курсор в конец при открытии редактора
  useEffect(() => {
    if (!editingCommentId) return;
    const input = commentInputRef.current;
    if (!input) return;
    input.focus();
    const len = (input.value || '').length;
    input.setSelectionRange(len, len);
  }, [editingCommentId]);

  // Бесконечная сетка в мировой системе координат (рисуем с запасом по видимой области)
  const renderGrid = () => {
    if (!gridEnabled) return null;

    const width = containerRef.current?.clientWidth || 1000;
    const height = containerRef.current?.clientHeight || 1000;
    const viewW = width / viewport.zoom;
    const viewH = height / viewport.zoom;
    const margin = Math.max(viewW, viewH) * 1.5;
    const startX = Math.floor((viewport.x - margin) / gridSize) * gridSize;
    const endX = Math.ceil((viewport.x + viewW + margin) / gridSize) * gridSize;
    const startY = Math.floor((viewport.y - margin) / gridSize) * gridSize;
    const endY = Math.ceil((viewport.y + viewH + margin) / gridSize) * gridSize;

    const lines = [];
    for (let x = startX; x <= endX; x += gridSize) {
      lines.push(
        <line key={`v-${x}`} x1={x} y1={startY} x2={x} y2={endY} stroke="#e0e0e0" strokeWidth={0.5 / viewport.zoom} />
      );
    }
    for (let y = startY; y <= endY; y += gridSize) {
      lines.push(
        <line key={`h-${y}`} x1={startX} y1={y} x2={endX} y2={y} stroke="#e0e0e0" strokeWidth={0.5 / viewport.zoom} />
      );
    }

    return <g className="grid-layer">{lines}</g>;
  };

  // Цвет створки двери по состоянию (зелёный — разблокирована, красный — заблокирована/аларм)
  const getDoorLeafColor = (doorObj) => {
    if (!Array.isArray(doors) || doors.length === 0) return '#00c853';
    const d = doors.find(dr => dr.id === doorObj.globalDoorId);
    if (!d) return '#00c853';
    if (d.alarming || d.locked) return '#d32f2f';
    return '#00c853';
  };

  // Состояние двери: открыта (physClosed=false), заблокирована, аларм (долго открыта)
  const getDoorState = (doorObj) => {
    if (!Array.isArray(doors) || doors.length === 0) return { locked: false, alarming: false, open: false };
    const d = doors.find(dr => dr.id === doorObj.globalDoorId);
    if (!d) return { locked: false, alarming: false, open: false };
    return { locked: !!d.locked, alarming: !!d.alarming, open: !d.physClosed };
  };

  // Графическое обозначение двери: закрыта — горизонтальная створка + дуга; открыта (не заблокирована) — вертикальная створка + дуга + пунктир открытия; при аларме (долго открыта) — мигание красный/зелёный
  const BOUNDARY_COLOR = '#2196F3';
  const ARC_COLOR = '#2196F3';
  const LEAF_STROKE = '#1a1a1a';

  const renderDoorSymbol = (obj) => {
    const x = obj.x;
    const y = obj.y;
    const w = obj.width || DOOR_WIDTH;
    const h = obj.height || DOOR_HEIGHT;
    const type = obj.doorType || 'single';
    const leafColor = getDoorLeafColor(obj);
    const state = getDoorState(obj);
    const selected = selectedObject?.id === obj.id;
    const strokeW = selected ? 2 : 1;
    const alarmClass = state.alarming ? 'door-leaf-alarm' : '';
    const isOpen = state.open && !state.locked;
    const rotation = (obj.rotation ?? 0) % 360;
    const flipH = obj.flipH ?? false;
    const flipV = obj.flipV ?? false;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const transform = `translate(${cx},${cy}) rotate(${rotation}) scale(${flipH ? -1 : 1},${flipV ? -1 : 1}) translate(${-cx},${-cy})`;

    const el = [];
    const half = DOOR_HANDLE_SIZE / 2;
    const { leafX, leafY, leafW: lw, leafH: lh } = getDoorLeafBounds(obj);
    const leafW = lw; // длина створки: 60 мм для single/electric, w/2 для double, 0.35w для sliding
    const arcR = lw;
    // Маркеры — по углам закрашенного прямоугольника створки (leaf), чтобы совпадали с видимой дверью
    const handleCorners = selected ? [
      { key: 'nw', x: leafX - half, y: leafY - half },
      { key: 'ne', x: leafX + lw - half, y: leafY - half },
      { key: 'sw', x: leafX - half, y: leafY + lh - half },
      { key: 'se', x: leafX + lw - half, y: leafY + lh - half },
    ] : [];

    // Подписи: ID — ниже видимой нижней грани створки; номер — слева от видимой левой грани, по центру линии границы (с учётом поворота двери)
    const leafCenterX = leafX + lw / 2;
    const leafBottomY = leafY + lh;
    let boundaryLineCenterY = leafY - lw / 2;
    if (type === 'double') {
      const leftLeafW = w * DOUBLE_LEAF_MAIN_RATIO;
      boundaryLineCenterY = leafY - leftLeafW / 2;
    }
    const LABEL_OFFSET = 10;
    const r = ((Math.round(rotation / 90) % 4) + 4) % 4; // 0, 1, 2, 3 -> 0°, 90°, 180°, 270°
    // ========== РАСПОЛОЖЕНИЕ НОМЕРА ДВЕРИ И ID (ЗАФИКСИРОВАНО КАК ПРАВИЛЬНОЕ) ==========
    // Позиции и ориентация для всех углов поворота (0°, 90°, 180°, 270°) и отражений (flipH/flipV)
    // считаются правильными. В локальных координатах двери: ID и номер в зависимости от r.
    const idPosByRotation = [
        { x: leafCenterX, y: leafBottomY + LABEL_OFFSET },           // 0°: ID под створкой
      { x: leafCenterX, y: leafBottomY + lh },                       // 90°: ID слева от двери (вертикально)
      { x: leafCenterX, y: leafY+lh/2+LABEL_OFFSET },                  // 180°: ID над створкой
      { x: leafCenterX, y: leafY+lh+LABEL_OFFSET },         // 270°: ID справа от двери
    ];
    const numPosByRotation = [
      { x: leafX - LABEL_OFFSET, y: boundaryLineCenterY },         // 0°: номер слева от линии границы
      { x: leafX - LABEL_OFFSET/2, y: leafBottomY - lw/2-LABEL_OFFSET},   // 90°: номер чуть выше синей линии, сдвиг вправо +12
      { x: leafX-LABEL_OFFSET/2, y: boundaryLineCenterY },      // 180°: номер справа от створки
      { x: leafCenterX-lw/2-LABEL_OFFSET, y: leafY-lw/2},                  // 270°: номер над створкой
    ];
    const { x: idX, y: idY } = idPosByRotation[r];
    const isReflected = flipH || flipV;
    // Позиция номера: для 90° и 180° в отражённом состоянии — отодвинуть от синей линии на LABEL_OFFSET/2
    let numX = numPosByRotation[r].x;
    let numY = numPosByRotation[r].y;
    if (r === 1 && isReflected) {
      numX = leafX - LABEL_OFFSET / 2 - LABEL_OFFSET / 2;
      numY = leafBottomY - lw / 2 - LABEL_OFFSET;
    } else if (r === 2 && isReflected) {
      numX = leafX - LABEL_OFFSET / 2 - LABEL_OFFSET / 2;
      numY = boundaryLineCenterY;
    }
    // Обратное преобразование к повороту/отражению двери — чтобы подписи оставались читаемыми (не зеркальными, не перевёрнутыми)
    const invRotateScale = (px, py) =>
      `translate(${px},${py}) rotate(${-rotation}) scale(${flipH ? -1 : 1},${flipV ? -1 : 1}) translate(${-px},${-py})`;
    const labelEls = [];
    const showIdForDoor = obj.showDoorIdOnDrawing === true || (showDoorId && obj.showDoorIdOnDrawing !== false);
    // Ориентация подписей (зафиксировано как правильное для всех поворотов и отражений):
    // ID параллельно створке; при 270° в отражённом — +180° (rotate 90°)
    const idVertical = r === 1 || r === 3;
    const idRotationAngle = idVertical ? ((r === 3 && isReflected) ? 90 : 270) : undefined;
    // Номер: ориентация и поправки для отражённого состояния (0°, 90°, 270° — повернуть на 180°; 90°, 180° — отступ от синей линии) — зафиксировано как правильное
    const numVertical = r === 0 || r === 2;
    const numRotationAngle = (r === 0 && isReflected) ? 270 : (r === 1 && isReflected) ? 180 : (r === 3 && isReflected) ? 180 : numVertical ? 90 : 0;
    if (showIdForDoor) {
      const doorRec = Array.isArray(doors) ? doors.find(dr => (dr.id ?? dr.doorId ?? dr.globalDoorId) === obj.globalDoorId) : null;
      const idStr = `ID-${doorRec?.label ?? doorRec?.id ?? obj.globalDoorId ?? '-'}`;
      labelEls.push(
        <g key="doorId" transform={invRotateScale(idX, idY)}>
          <text x={idX} y={idY} textAnchor="middle" dominantBaseline={idVertical ? 'middle' : undefined} fontSize={9} fill="#333" transform={idRotationAngle !== undefined ? `rotate(${idRotationAngle} ${idX} ${idY})` : undefined}>{idStr}</text>
        </g>
      );
    }
    if (obj.showNumberOnDrawing && (obj.drawNumber ?? '').trim()) {
      labelEls.push(
        <g key="drawNumber" transform={invRotateScale(numX, numY)}>
          <text x={numX} y={numY} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#333" transform={numRotationAngle !== 0 ? `rotate(${numRotationAngle} ${numX} ${numY})` : undefined}>{(obj.drawNumber ?? '').trim()}</text>
        </g>
      );
    }

    const wrap = (content) => (
      <g key={obj.id} transform={transform} onClick={(ev) => { ev.stopPropagation(); onObjectSelect(obj); }}>
        {content}
        {labelEls}
        {handleCorners.map(({ key, x: hx, y: hy }) => (
          <rect
            key={`handle-${key}`}
            x={hx}
            y={hy}
            width={DOOR_HANDLE_SIZE}
            height={DOOR_HANDLE_SIZE}
            fill="#fff"
            stroke="#007bff"
            strokeWidth={1.5}
            pointerEvents="all"
          />
        ))}
      </g>
    );

    // Одностворчатая: створка слева (как single-right)
    if (type === 'single' || type === 'electric') {
      if (isOpen) {
        const openLeafW = h;
        const openLeafH = leafW;
        el.push(<line key="boundary" x1={x} y1={y} x2={x} y2={y - leafW} stroke={BOUNDARY_COLOR} strokeWidth={1.5} />);
        el.push(<circle key="hinge" cx={x} cy={y - leafW} r={2.5} fill="#fff" stroke={BOUNDARY_COLOR} strokeWidth={1.5} />);
        el.push(<rect key="trace" x={x} y={y} width={leafW} height={h} fill="none" stroke={ARC_COLOR} strokeWidth={1} strokeDasharray="4,2" />);
        el.push(<rect key="leaf" className={alarmClass} x={x} y={y - leafW} width={openLeafW} height={openLeafH} fill={leafColor} stroke={LEAF_STROKE} strokeWidth={strokeW} />);
        el.push(<path key="arc" d={`M ${x + leafW} ${y} A ${leafW} ${leafW} 0 0 0 ${x} ${y - leafW}`} fill="none" stroke={ARC_COLOR} strokeWidth={1} strokeDasharray="4,2" />);
        if (type === 'electric') el.push(<text key="e" x={x + leafW - 6} y={y + h - 2} fontSize={8} fill="#333" fontWeight="bold">E</text>);
        return wrap(el);
      }
      // Синяя вертикальная линия от левого конца створки вверх (ось шарнира)
      el.push(<line key="boundary" x1={x} y1={y} x2={x} y2={y - leafW} stroke={BOUNDARY_COLOR} strokeWidth={1.5} />);
      // Кружок на верхнем конце синей линии — из него выходит пунктирная дуга открытия
      el.push(<circle key="hinge" cx={x} cy={y - leafW} r={2.5} fill="#fff" stroke={BOUNDARY_COLOR} strokeWidth={1.5} />);
      el.push(<rect key="leaf" className={alarmClass} x={x} y={y} width={leafW} height={h} fill={leafColor} stroke={LEAF_STROKE} strokeWidth={strokeW} />);
      // Пунктирная дуга открытия: от правого края створки вверх по дуге, заканчивается на синей линии вверху в кружочке
      el.push(<path key="arc" d={`M ${x + leafW} ${y} A ${arcR} ${arcR} 0 0 0 ${x} ${y - arcR}`} fill="none" stroke={ARC_COLOR} strokeWidth={1} strokeDasharray="4,2" />);
            // Стрелка — окончание пунктирной линии у кружка; показывает направление открывания створки (от створки к кружку)
      const arcEndX = x;                                    // X конца дуги (у кружка на синей линии)
      const arcEndY = y - arcR;                             // Y конца дуги
      const fromCircleToLeafX = x;      // вектор от кружка к правому краю створки (по X)
      const fromCircleToLeafY = y - arcEndY;                // вектор от кружка к правому краю створки (по Y)
      const arrLen = Math.hypot(fromCircleToLeafX, fromCircleToLeafY) || 1;  // длина вектора (защита от нуля)
      const ux = fromCircleToLeafX / arrLen;                // единичный вектор: от кружка к створке (X)
      const uy = fromCircleToLeafY / arrLen;                // единичный вектор: от кружка к створке (Y)
      const arrSize = 10;                                    // длина стрелки (высота треугольника)
      const bcx = arcEndX + ux * arrSize;                   // центр основания стрелки (X)
      const bcy = arcEndY + uy * arrSize;                   // центр основания стрелки (Y)
      const perpX = -uy;                                    // перпендикуляр к направлению стрелки (X)
      const perpY = ux;                                     // перпендикуляр к направлению стрелки (Y)
      const halfW = arrSize * 0.3;                           // половина ширины основания стрелки
      const ab1x = bcx + perpX * halfW;                     // первая точка основания треугольника (X)
      const ab1y = bcy + perpY * halfW;                     // первая точка основания треугольника (Y)
      const ab2x = bcx - perpX * halfW;                     // вторая точка основания треугольника (X)
      const ab2y = bcy - perpY * halfW;                     // вторая точка основания треугольника (Y)
      el.push(<path key="arcArrow" d={`M ${arcEndX} ${arcEndY} L ${ab1x} ${ab1y} L ${ab2x} ${ab2y} Z`} fill={ARC_COLOR} stroke="none" />);  // рисуем треугольник стрелки (остриё у кружка)
      if (type === 'electric') el.push(<text key="e" x={x + leafW - 6} y={y + h - 2} fontSize={8} fill="#333" fontWeight="bold">E</text>);
      return wrap(el);
    }

    // Двухстворчатая: левая открывается влево (как одностворчатая), правая — вправо (поворот вокруг верхнего правого угла)
    if (type === 'double') {
      const leftLeafW = w * DOUBLE_LEAF_MAIN_RATIO;
      const rightLeafW = w * (1 - DOUBLE_LEAF_MAIN_RATIO);
      if (isOpen) {
        // Открыто: левая створка вертикально слева (как у одностворчатой), правая — вертикально справа (открыта вправо)
        el.push(<rect key="traceL" x={x} y={y} width={leftLeafW} height={h} fill="none" stroke={ARC_COLOR} strokeWidth={1} strokeDasharray="4,2" />);
        el.push(<rect key="traceR" x={x + w - rightLeafW} y={y} width={rightLeafW} height={h} fill="none" stroke={ARC_COLOR} strokeWidth={1} strokeDasharray="4,2" />);
        el.push(<rect key="leafL" className={alarmClass} x={x} y={y - leftLeafW} width={h} height={leftLeafW} fill={leafColor} stroke={LEAF_STROKE} strokeWidth={strokeW} />);
        // Правая створка: поворот вокруг верхнего правого угла (x+w, y), открывается вправо → вертикальная полоса вверх от шарнира
        el.push(<rect key="leafR" className={alarmClass} x={x + w - h} y={y - rightLeafW} width={h} height={rightLeafW} fill={leafColor} stroke={LEAF_STROKE} strokeWidth={strokeW} />);
        // Дуга левой: как у одностворчатой — от (x+leftLeafW, y) к (x, y-leftLeafW)
        el.push(<path key="arcL" d={`M ${x + leftLeafW} ${y} A ${leftLeafW} ${leftLeafW} 0 0 0 ${x} ${y - leftLeafW}`} fill="none" stroke={ARC_COLOR} strokeWidth={1} strokeDasharray="4,2" />);
        // Дуга правой: от левого верхнего угла закрашенного прямоугольника (x+w-rightLeafW, y), вверх по часовой стрелке на 90° → (x+w, y-rightLeafW)
        el.push(<path key="arcR" d={`M ${x + w - rightLeafW} ${y} A ${rightLeafW} ${rightLeafW} 0 0 1 ${x + w} ${y - rightLeafW}`} fill="none" stroke={ARC_COLOR} strokeWidth={1} strokeDasharray="4,2" />);
        return wrap(el);
      }
      // Закрыто: радиусные линии — левая вверх как у одностворчатой, правая вверх от (x+w, y) к (x+w, y-rightLeafW)
      el.push(<line key="boundaryL" x1={x} y1={y} x2={x} y2={y - leftLeafW} stroke={BOUNDARY_COLOR} strokeWidth={1.5} />);
      el.push(<line key="boundaryR" x1={x + w} y1={y} x2={x + w} y2={y - rightLeafW} stroke={BOUNDARY_COLOR} strokeWidth={1.5} />);
      el.push(<rect key="leafL" className={alarmClass} x={x} y={y} width={leftLeafW} height={h} fill={leafColor} stroke={LEAF_STROKE} strokeWidth={strokeW} />);
      el.push(<rect key="leafR" className={alarmClass} x={x + w - rightLeafW} y={y} width={rightLeafW} height={h} fill={leafColor} stroke={LEAF_STROKE} strokeWidth={strokeW} />);
      // Дуга левой: как одностворчатая — M (x+leftLeafW, y) A ... (x, y-leftLeafW)
      el.push(<path key="arcL" d={`M ${x + leftLeafW} ${y} A ${leftLeafW} ${leftLeafW} 0 0 0 ${x} ${y - leftLeafW}`} fill="none" stroke={ARC_COLOR} strokeWidth={1} strokeDasharray="4,2" />);
      // Дуга правой: от левого верхнего угла малой створки (x+w-rightLeafW, y), вверх по часовой стрелке на 90° → (x+w, y-rightLeafW)
      el.push(<path key="arcR" d={`M ${x + w - rightLeafW} ${y} A ${rightLeafW} ${rightLeafW} 0 0 1 ${x + w} ${y - rightLeafW}`} fill="none" stroke={ARC_COLOR} strokeWidth={1} strokeDasharray="4,2" />);
      return wrap(el);
    }

    // Раздвижная: проём + панель (прямоугольник)
    if (type === 'sliding') {
      el.push(<line key="boundary" x1={x} y1={y} x2={x} y2={y + h} stroke={BOUNDARY_COLOR} strokeWidth={1.5} />);
      el.push(<line key="boundary2" x1={x + w} y1={y} x2={x + w} y2={y + h} stroke={BOUNDARY_COLOR} strokeWidth={1.5} />);
      el.push(<rect key="leaf" className={alarmClass} x={x + w * 0.1} y={y} width={leafW} height={h} fill={leafColor} stroke={LEAF_STROKE} strokeWidth={strokeW} />);
      return wrap(el);
    }

    return wrap(el);
  };

  // Рендеринг объектов
  const renderObjects = () => {
    return objects.map(obj => {
      if (obj.type === 'wall') {
        return (
          <line
            key={obj.id}
            x1={obj.x1}
            y1={obj.y1}
            x2={obj.x2}
            y2={obj.y2}
            stroke={obj.color || '#333333'}
            strokeWidth={obj.thickness || 5}
            className={selectedObject?.id === obj.id ? 'selected' : ''}
            onClick={(ev) => { ev.stopPropagation(); onObjectSelect(obj); }}
          />
        );
      }
      if (obj.type === 'door') {
        return renderDoorSymbol(obj);
      }
      if (obj.type === 'label') {
        return (
          <text
            key={obj.id}
            x={obj.x}
            y={obj.y + (obj.fontSize || 12)}
            fontSize={obj.fontSize || 12}
            fill="#333"
            className={selectedObject?.id === obj.id ? 'selected' : ''}
            onClick={(ev) => { ev.stopPropagation(); onObjectSelect(obj); }}
          >
            {obj.text || '№'}
          </text>
        );
      }
      if (obj.type === 'comment') {
        const isEditing = editingCommentId === obj.id && selectedTool === 'select' && mode === 'edit';
        const fs = obj.fontSize || 14;
        if (isEditing && onObjectChange) {
          return (
            <g key={obj.id}>
              <foreignObject
                x={obj.x}
                y={obj.y}
                width={280}
                height={Math.max(22, fs + 8)}
                style={{ overflow: 'visible' }}
                onClick={(ev) => ev.stopPropagation()}
              >
                <input
                  ref={commentInputRef}
                  type="text"
                  defaultValue={obj.text || ''}
                  className="mapping-comment-input"
                  style={{
                    width: '100%',
                    height: '100%',
                    boxSizing: 'border-box',
                    fontSize: fs,
                    padding: '2px 6px',
                    border: '1px solid #2196F3',
                    outline: 'none',
                    color: '#333',
                    fontStyle: 'italic',
                    background: '#fff',
                  }}
                  onClick={(ev) => ev.stopPropagation()}
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') {
                      ev.preventDefault();
                      const value = ev.target.value.trim();
                      onObjectChange({ ...obj, text: value || '' });
                      setEditingCommentId(null);
                    }
                  }}
                />
              </foreignObject>
            </g>
          );
        }
        return (
          <text
            key={obj.id}
            x={obj.x}
            y={obj.y + fs}
            fontSize={fs}
            fill="#666"
            fontStyle="italic"
            className={selectedObject?.id === obj.id ? 'selected' : ''}
            onClick={(ev) => { ev.stopPropagation(); onObjectSelect(obj); }}
          >
            {obj.text || ''}
          </text>
        );
      }
      return null;
    });
  };

  // Ручки изменения размера двери рисуются внутри символа двери (в той же transform-группе), здесь не рисуем
  const renderDoorResizeHandles = () => {
    if (!selectedObject || selectedObject.type !== 'door' || mode !== 'edit') return null;
    return null; // маркеры двери рисуются в renderDoorSymbol внутри transform-группы
  };

  // Получаем размеры контейнера (минимум 400x300, чтобы канвас всегда был виден при открытии вкладки)
  const MIN_CANVAS_WIDTH = 400;
  const MIN_CANVAS_HEIGHT = 300;
  const [containerSize, setContainerSize] = useState({ width: MIN_CANVAS_WIDTH, height: MIN_CANVAS_HEIGHT });

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        setContainerSize({
          width: Math.max(MIN_CANVAS_WIDTH, w || MIN_CANVAS_WIDTH),
          height: Math.max(MIN_CANVAS_HEIGHT, h || MIN_CANVAS_HEIGHT),
        });
      }
    };
    updateSize();
    const el = containerRef.current;
    if (el && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateSize);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Показать карту полностью в окне: подогнать вид так, чтобы все объекты помещались
  const fitToView = useCallback(() => {
    const w = containerSize.width;
    const h = containerSize.height;
    const pad = 40;
    let minX = 0, minY = 0, maxX = 400, maxY = 300;
    if (objects && objects.length > 0) {
      minX = Infinity;
      minY = Infinity;
      maxX = -Infinity;
      maxY = -Infinity;
      objects.forEach(obj => {
        if (obj.type === 'wall') {
          minX = Math.min(minX, obj.x1, obj.x2);
          minY = Math.min(minY, obj.y1, obj.y2);
          maxX = Math.max(maxX, obj.x1, obj.x2);
          maxY = Math.max(maxY, obj.y1, obj.y2);
        } else if (obj.type === 'door') {
          const ow = obj.width || DOOR_WIDTH;
          const oh = obj.height || DOOR_HEIGHT;
          minX = Math.min(minX, obj.x, obj.x + ow);
          minY = Math.min(minY, obj.y, obj.y + oh);
          maxX = Math.max(maxX, obj.x, obj.x + ow);
          maxY = Math.max(maxY, obj.y, obj.y + oh);
        } else if (obj.type === 'label' || obj.type === 'comment') {
          const tw = 80;
          const th = (obj.fontSize || 14) + 8;
          minX = Math.min(minX, obj.x);
          minY = Math.min(minY, obj.y);
          maxX = Math.max(maxX, obj.x + tw);
          maxY = Math.max(maxY, obj.y + th);
        }
      });
      if (minX === Infinity) {
        minX = 0;
        minY = 0;
        maxX = 400;
        maxY = 300;
      }
    }
    const boxW = maxX - minX + 2 * pad;
    const boxH = maxY - minY + 2 * pad;
    const zoomX = w / boxW;
    const zoomY = h / boxH;
    const zoom = Math.max(0.1, Math.min(5, Math.min(zoomX, zoomY) || 1));
    const newX = minX - pad;
    const newY = minY - pad;
    onViewportChange({ x: newX, y: newY, zoom });
  }, [containerSize.width, containerSize.height, objects, onViewportChange]);

  useImperativeHandle(ref, () => ({ fitToView }), [fitToView]);

  return (
    <div
      ref={containerRef}
      className={`mapping-canvas-container${selectedTool === 'select' ? ' select-tool' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
    >
      <svg
        ref={svgRef}
        className="mapping-canvas"
        viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
        preserveAspectRatio="none"
      >
        <g transform={`translate(${-viewport.x * viewport.zoom}, ${-viewport.y * viewport.zoom}) scale(${viewport.zoom})`}>
          {renderGrid()}
          <g className="objects-layer">
            {renderObjects()}
          </g>
          {renderDoorResizeHandles()}
          {isDrawing && drawingStart && currentMousePos && (
            <line
              x1={drawingStart.x}
              y1={drawingStart.y}
              x2={currentMousePos.x}
              y2={currentMousePos.y}
              stroke="#007bff"
              strokeWidth={5}
              strokeDasharray="5,5"
              className="drawing-preview"
            />
          )}
          {snapPoint && selectedTool !== 'select' && (
            <circle
              cx={snapPoint.x}
              cy={snapPoint.y}
              r={4}
              fill="#007bff"
              stroke="white"
              strokeWidth={2}
              className="snap-indicator"
            />
          )}
        </g>
      </svg>
    </div>
  );
});

MappingCanvas.displayName = 'MappingCanvas';

export default MappingCanvas;
