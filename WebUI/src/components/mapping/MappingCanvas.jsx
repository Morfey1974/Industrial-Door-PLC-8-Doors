/**
 * SVG Canvas для рисования карты
 */

import React, { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle, memo } from 'react';
import './MappingCanvas.css';

const DOOR_HEIGHT = 10;
/** Ширина двери по умолчанию по типам (мм): одностворчатая 90, двустворчатая 120, раздвижная 120, электрическая 90 */
const DEFAULT_DOOR_WIDTH = { single: 90, double: 120, sliding: 120, electric: 90 };
const DOOR_WIDTH = 80; // fallback для объектов без типа или старых данных
/** Максимум символов в поле комментария (включая переносы строк) */
const COMMENT_MAX_LENGTH = 500;

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
  const [isResizingWall, setIsResizingWall] = useState(false);
  const [wallResizeEnd, setWallResizeEnd] = useState(null); // 'start' | 'end'
  const lastMovedObjectsRef = useRef(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const commentInputRef = useRef(null);

  const DOOR_HANDLE_SIZE = 8;
  const MIN_DOOR_SIZE = 12;
  const LEAF_WIDTH_RATIO = 0.35; // не используется для раздвижной (панель = вся ширина проёма, как у одностворчатой)
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
      leafX = o.x;
      leafY = o.y;
      leafW = w; // длина панели как у одностворчатой (на всю ширину проёма)
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

  // Проверка попадания в маркер конца стены (при выбранной стене в режиме редактирования)
  // Радиус маркеров концов стены (мм); за них тянем для изменения длины/положения стены
  const WALL_HANDLE_R = 10;
  const hitTestWallEndpoint = useCallback((worldX, worldY) => {
    if (!selectedObject || selectedObject.type !== 'wall') return null;
    const w = selectedObject;
    const d1 = Math.sqrt((worldX - w.x1) ** 2 + (worldY - w.y1) ** 2);
    const d2 = Math.sqrt((worldX - w.x2) ** 2 + (worldY - w.y2) ** 2);
    if (d1 <= WALL_HANDLE_R) return 'start';
    if (d2 <= WALL_HANDLE_R) return 'end';
    return null;
  }, [selectedObject]);

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

      // double: маркеры по углам всего проёма (как single); single/sliding/electric — по створке (длина панели = ширина двери)
      if (type !== 'double') {
        const newLeafWFromRight = (v) => Math.max(MIN_DOOR_SIZE, v);
        const newLeafWFromLeft = (v) => Math.max(MIN_DOOR_SIZE, v);
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

    // Ресайз стены за маркеры концов: тянем начало или конец стены в новую точку (с привязкой)
    if (isResizingWall && wallResizeEnd && selectedObject?.type === 'wall') {
      const pt = findSnapPoint(svgPoint.x, svgPoint.y) || svgPoint;
      const wall = selectedObject;
      const next = objects.map(o => {
        if (o.id !== wall.id) return o;
        if (wallResizeEnd === 'start') {
          return { ...o, x1: pt.x, y1: pt.y };
        }
        return { ...o, x2: pt.x, y2: pt.y };
      });
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
    isResizingWall,
    wallResizeEnd,
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
          // Зона выделения = размер створки (без расширения влево/вверх)
          const { leafX, leafY, leafW, leafH } = getDoorLeafBounds(o);
          hitMinX = leafX;
          hitMinY = leafY;
          hitMaxX = leafX + leafW;
          hitMaxY = leafY + leafH;
        }
        const doorTolerance = 0; // зона выделения двери совпадает с размером объекта
        if (localX >= hitMinX - doorTolerance && localX <= hitMaxX + doorTolerance && localY >= hitMinY - doorTolerance && localY <= hitMaxY + doorTolerance) return o;
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

    // Выбор и перемещение (или ресайз двери за углы, или ресайз стены за концы)
    if (selectedTool === 'select' && mode === 'edit') {
      const wallEnd = hitTestWallEndpoint(svgPoint.x, svgPoint.y);
      if (wallEnd && selectedObject?.type === 'wall') {
        e.stopPropagation();
        setIsResizingWall(true);
        setWallResizeEnd(wallEnd);
        return;
      }
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
      if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number') return;
      const doorType = selectedDoorType || 'single';
      const defaultW = DEFAULT_DOOR_WIDTH[doorType] ?? DOOR_WIDTH;
      const gid = selectedDoorId != null ? selectedDoorId : (Array.isArray(doors) && doors[0] ? (doors[0].id ?? doors[0].doorId ?? doors[0].globalDoorId) : undefined);
      const doorId = `door_${Date.now()}`;
      const x = pt.x - defaultW / 2;
      const y = pt.y - DOOR_HEIGHT / 2;
      const newDoor = {
        id: doorId,
        type: 'door',
        x,
        y,
        width: defaultW,
        height: DOOR_HEIGHT,
        globalDoorId: gid ?? 0,
        doorType,
        flipH: defaultDoorFlipH ?? false,
        flipV: defaultDoorFlipV ?? false,
        rotation: defaultDoorRotation ?? 0,
        drawNumber: defaultDrawNumber ?? '',
        showNumberOnDrawing: defaultShowNumberOnDrawing ?? false,
      };
      const newObjects = Array.isArray(objects) ? [...objects, newDoor] : [newDoor];
      onObjectsChange(newObjects);
      onObjectSelect(newDoor);
      return;
    }

    // Вставка номера/метки
    if (selectedTool === 'label' && mode === 'edit') {
      onObjectsChange([...objects, { id: `label_${Date.now()}`, type: 'label', x: pt.x, y: pt.y, text: '№', fontSize: 12 }]);
      return;
    }

    // Вставка комментария: сразу выбираем и открываем поле ввода текста
    if (selectedTool === 'comment' && mode === 'edit') {
      e.preventDefault();
      e.stopPropagation();
      const newComment = { id: `comment_${Date.now()}`, type: 'comment', x: pt.x, y: pt.y, text: '', fontSize: 14, textAnchor: 'start' };
      onObjectsChange([...objects, newComment]);
      onObjectSelect(newComment);
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
    hitTestWallEndpoint,
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
    setIsResizingWall(false);
    setWallResizeEnd(null);
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

  // При выборе комментария (инструмент «Выбор» или только что вставлен инструментом «Комментарий») — войти в режим редактирования текста в канвасе
  useEffect(() => {
    if (mode === 'edit' && selectedObject?.type === 'comment') {
      setEditingCommentId(selectedObject.id);
    } else {
      setEditingCommentId(null);
    }
  }, [mode, selectedObject?.id, selectedObject?.type]);

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

  // Карта по globalDoorId — один проход по doors, O(1) поиск при рендере каждой двери (без лишних find при галочке ID)
  const doorsByGlobalId = useMemo(() => {
    const m = new Map();
    if (doors && Array.isArray(doors)) {
      for (const dr of doors) {
        const gid = dr?.globalDoorId ?? dr?.id ?? dr?.doorId;
        if (gid != null) m.set(Number(gid), dr);
      }
    }
    return m;
  }, [doors]);

  // Цвет створки двери по состоянию (зелёный — разблокирована, красный — заблокирована/аларм)
  const getDoorLeafColor = (doorObj) => {
    const d = doorsByGlobalId.get(doorObj?.globalDoorId ?? 0);
    if (!d) return '#00c853';
    if (d.alarming || d.locked) return '#d32f2f';
    return '#00c853';
  };

  // Состояние двери: открыта (physClosed=false), заблокирована, аларм (долго открыта)
  const getDoorState = (doorObj) => {
    const d = doorsByGlobalId.get(doorObj?.globalDoorId ?? 0);
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
    // Маркеры редактирования показываем только в режиме редактирования; в режиме просмотра объект показывается без маркеров
    const showEditHandles = selected && selectedTool === 'select' && mode === 'edit';
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
    // Маркеры — по углам закрашенного прямоугольника створки (leaf); только в режиме редактирования
    const handleCorners = showEditHandles ? [
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
    const isReflected = flipH || flipV;

    let idX, idY, numX, numY, idVertical, numVertical, idRotationAngle, numRotationAngle;

    if (type === 'sliding') {
      // Раздвижная: ID и Номер параллельно створке с двух сторон от неё; при повороте/отражении остаются по сторонам створки; текст всегда читаемый
      const leafCenterY = leafY + lh / 2;
      const slidingIdPos = [
        { x: leafCenterX, y: leafY-lh/2 },           // 0°: ID выше створки
        { x: leafX+lw/2, y: leafCenterY - LABEL_OFFSET-lh/2 },           // 90°: ID слева от створки
        { x: leafCenterX, y: leafY - LABEL_OFFSET },     // 180°: ID ниже створки
        { x: leafX+lw/2, y: leafCenterY -LABEL_OFFSET },      // 270°: ID справа от створки
      ];
      const slidingNumPos = [
        { x: leafCenterX, y: leafY + lh + LABEL_OFFSET },     // 0°: Номер ниже створки
        { x: leafX+lw/2, y: leafCenterY+LABEL_OFFSET+lh/2 },     // 90°: Номер справа от створки
        { x: leafCenterX, y: leafY +lh/2+ LABEL_OFFSET },          // 180°: Номер выше створки
        { x: leafX+lw/2, y: leafCenterY+lh/2+LABEL_OFFSET },          // 270°: Номер слева от створки
      ];
      idX = slidingIdPos[r].x;
      idY = slidingIdPos[r].y;
      numX = slidingNumPos[r].x;
      numY = slidingNumPos[r].y;
      idVertical = r === 1 || r === 3; // вертикальный текст при вертикальной створке (параллельно створке)
      // invRotateScale уже отменяет поворот/отражение двери — текст не зеркалится; только направление вдоль створки (0°/90°/270°)
      idRotationAngle = idVertical ? (isReflected ? 90 : 270) : 0;
      numRotationAngle = idVertical ? (isReflected ? 270 : 90) : 0;
      if (r === 1) idRotationAngle = (idRotationAngle + 180) % 360; // раздвижная 90°: ID повёрнут на 180°
      if (r === 3) numRotationAngle = (numRotationAngle + 180) % 360; // раздвижная 270°: Номер повёрнут на 180°
    } else {
      // ========== РАСПОЛОЖЕНИЕ НОМЕРА ДВЕРИ И ID (single, double, electric) ==========
      const idPosByRotation = [
        { x: leafCenterX, y: leafBottomY + LABEL_OFFSET },           // 0°: ID под створкой
        { x: leafCenterX, y: leafBottomY + lh },                       // 90°: ID слева от двери (вертикально)
        { x: leafCenterX, y: leafY+lh/2+LABEL_OFFSET },                  // 180°: ID над створкой
        { x: leafCenterX, y: leafY+lh+LABEL_OFFSET },         // 270°: ID справа от двери
      ];
      const numPosByRotation = [
        { x: leafX - LABEL_OFFSET, y: boundaryLineCenterY },         // 0°: номер слева от линии границы
        { x: leafX - LABEL_OFFSET/2, y: leafBottomY - lw/2-LABEL_OFFSET},   // 90°: номер чуть выше синей линии
        { x: leafX-LABEL_OFFSET/2, y: boundaryLineCenterY },      // 180°: номер справа от створки
        { x: leafCenterX-lw/2-LABEL_OFFSET, y: leafY-lw/2},                  // 270°: номер над створкой
      ];
      idX = idPosByRotation[r].x;
      idY = idPosByRotation[r].y;
      numX = numPosByRotation[r].x;
      numY = numPosByRotation[r].y;
      if (r === 1 && isReflected) {
        numX = leafX - LABEL_OFFSET / 2 - LABEL_OFFSET / 2;
        numY = leafBottomY - lw / 2 - LABEL_OFFSET;
      } else if (r === 2 && isReflected) {
        numX = leafX - LABEL_OFFSET / 2 - LABEL_OFFSET / 2;
        numY = boundaryLineCenterY;
      }
      idVertical = r === 1 || r === 3;
      idRotationAngle = idVertical ? ((r === 3 && isReflected) ? 90 : 270) : undefined;
      numVertical = r === 0 || r === 2;
      numRotationAngle = (r === 0 && isReflected) ? 270 : (r === 1 && isReflected) ? 180 : (r === 3 && isReflected) ? 180 : numVertical ? 90 : 0;
    }

    // Обратное преобразование к повороту/отражению двери — чтобы подписи оставались читаемыми (не зеркальными, не перевёрнутыми)
    const invRotateScale = (px, py) =>
      `translate(${px},${py}) rotate(${-rotation}) scale(${flipH ? -1 : 1},${flipV ? -1 : 1}) translate(${-px},${-py})`;
    const labelEls = [];
    const showIdForDoor = obj.showDoorIdOnDrawing === true || (showDoorId && obj.showDoorIdOnDrawing !== false);
    if (showIdForDoor) {
      const doorRec = doorsByGlobalId.get(obj?.globalDoorId ?? 0) ?? null;
      // ID привязан к плате: ID-{nodeId}-{localDoor}, например ID-1-1 = плата 1 дверь 1
      const nodeId = doorRec?.nodeId ?? 1;
      const localDoor = doorRec?.localDoor ?? doorRec?.localDoorId ?? doorRec?.id ?? doorRec?.doorId ?? doorRec?.globalDoorId ?? obj.globalDoorId ?? '-';
      const idStr = `ID-${nodeId}-${localDoor}`;
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
      // Закрыто: синие вертикальные линии (границы проёма) + две створки + дуги открытия
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

    // Раздвижная: при открытии створка сдвигается влево до левого верхнего угла левой опоры (правый край створки = leafX)
    if (type === 'sliding') {
      const leafX = x;
      const gap = 2;
      const supportH = h * 0.5;
      const supportW = Math.max(4, h);
      const leafOpenX = leafX - leafW; // открыто: створка влево, правый край у левой опоры (leafX)
      el.push(<rect key="leaf" className={alarmClass} x={isOpen ? leafOpenX : leafX} y={y} width={leafW} height={h} fill={leafColor} stroke={LEAF_STROKE} strokeWidth={strokeW} />);
      el.push(<rect key="supportL" x={leafX} y={y + h + gap} width={supportW} height={supportH} fill="#fff" stroke={LEAF_STROKE} strokeWidth={strokeW} />);
      el.push(<rect key="supportR" x={leafX + leafW - supportW} y={y + h + gap} width={supportW} height={supportH} fill="#fff" stroke={LEAF_STROKE} strokeWidth={strokeW} />);
      return wrap(el);
    }

    return wrap(el);
  };

  // Рендеринг объектов: стены всегда на заднем плане, двери — на переднем (порядок не зависит от редактирования)
  const LAYER_ORDER = { wall: 0, label: 1, comment: 2, door: 3 };
  const renderObjects = () => {
    const valid = (objects || []).filter(o => o && o.type);
    const sorted = [...valid].sort((a, b) => {
      const la = LAYER_ORDER[a.type] ?? 1;
      const lb = LAYER_ORDER[b.type] ?? 1;
      if (la !== lb) return la - lb;
      return valid.indexOf(a) - valid.indexOf(b);
    });
    return sorted.map(obj => {
      if (obj.type === 'wall') {
        // В режиме выбора/редактирования — два маркера по концам стены; тянем за них для изменения длины/положения
        const selected = selectedObject?.id === obj.id && selectedTool === 'select' && mode === 'edit';
        return (
          <g key={obj.id}>
            <line
              x1={obj.x1}
              y1={obj.y1}
              x2={obj.x2}
              y2={obj.y2}
              stroke={obj.color || '#333333'}
              strokeWidth={obj.thickness || 5}
              className={selected ? 'selected' : ''}
              onClick={(ev) => { ev.stopPropagation(); onObjectSelect(obj); }}
            />
            {selected && (
              <>
                <circle
                  cx={obj.x1}
                  cy={obj.y1}
                  r={WALL_HANDLE_R}
                  fill="none"
                  stroke="#007bff"
                  strokeWidth={2}
                  className="wall-endpoint-handle"
                  onClick={(ev) => ev.stopPropagation()}
                />
                <circle
                  cx={obj.x2}
                  cy={obj.y2}
                  r={WALL_HANDLE_R}
                  fill="none"
                  stroke="#007bff"
                  strokeWidth={2}
                  className="wall-endpoint-handle"
                  onClick={(ev) => ev.stopPropagation()}
                />
              </>
            )}
          </g>
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
        const isEditing = editingCommentId === obj.id && mode === 'edit';
        const fs = obj.fontSize || 14;
        if (isEditing && onObjectChange) {
          const lineCount = (obj.text || '').split('\n').length;
          const editHeight = Math.max(60, Math.min(120, lineCount * (fs + 6) + 16));
          return (
            <g key={obj.id}>
              <foreignObject
                x={obj.x}
                y={obj.y}
                width={280}
                height={editHeight}
                style={{ overflow: 'visible' }}
                onClick={(ev) => ev.stopPropagation()}
              >
                <textarea
                  ref={commentInputRef}
                  defaultValue={obj.text || ''}
                  maxLength={COMMENT_MAX_LENGTH}
                  title={`До ${COMMENT_MAX_LENGTH} символов. Shift+Enter — новая строка, Enter или Esc — выйти.`}
                  className="mapping-comment-input"
                  rows={3}
                  style={{
                    width: '100%',
                    height: '100%',
                    boxSizing: 'border-box',
                    fontSize: fs,
                    padding: '4px 6px',
                    border: '1px solid #2196F3',
                    outline: 'none',
                    color: '#333',
                    fontStyle: 'italic',
                    background: '#fff',
                    resize: 'none',
                  }}
                  onClick={(ev) => ev.stopPropagation()}
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onKeyDown={(ev) => {
                    ev.stopPropagation(); // Backspace/Delete не должны удалять объект — только стирать текст в поле
                    if (ev.key === 'Enter' && !ev.shiftKey) {
                      ev.preventDefault();
                      const value = ev.target.value;
                      onObjectChange({ ...obj, text: value || '' });
                      setEditingCommentId(null);
                    } else if (ev.key === 'Escape') {
                      ev.preventDefault();
                      const value = ev.target.value;
                      onObjectChange({ ...obj, text: value || '' });
                      setEditingCommentId(null);
                      onObjectSelect(null); // снять выбор — панель «Свойства» закрывается
                    }
                    // Shift+Enter — переход на новую строку (стандартное поведение textarea)
                  }}
                />
              </foreignObject>
            </g>
          );
        }
        const anchor = obj.textAnchor || 'start';
        const lines = (obj.text || '').split('\n');
        const lineHeight = fs + 2;
        return (
          <text
            key={obj.id}
            x={obj.x}
            y={obj.y + fs}
            fontSize={fs}
            fill="#666"
            fontStyle="italic"
            textAnchor={anchor}
            className={selectedObject?.id === obj.id ? 'selected' : ''}
            onClick={(ev) => { ev.stopPropagation(); onObjectSelect(obj); }}
          >
            {lines.map((line, i) =>
              i === 0 ? line : <tspan key={i} x={obj.x} dy={lineHeight}>{line}</tspan>
            )}
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
      className={`mapping-canvas-container${mode === 'view' ? ' view-mode' : ''}${selectedTool === 'select' && mode === 'edit' ? ' select-tool' : ''}${isPanning ? ' panning' : ''}`}
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
          {snapPoint && selectedTool !== 'select' && mode === 'edit' && (
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

export default memo(MappingCanvas);
