/**
 * SVG Canvas для рисования карты
 */

import React, { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle, memo } from 'react';
import { calculateGlobalDoorId } from '../../utils/configValidator';
import './MappingCanvas.css';

/** Числовой globalDoorId из объекта двери (API может не передавать globalDoorId, только nodeId+localDoor) */
function getGlobalDoorIdFromDoor(d) {
  if (!d) return undefined;
  if (d.globalDoorId != null) return Number(d.globalDoorId);
  const nodeId = d.nodeId ?? 1;
  const localDoor = d.localDoor ?? d?.localDoorId;
  if (localDoor != null) return calculateGlobalDoorId(nodeId, localDoor);
  return d?.id ?? d?.doorId;
}

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
  selectedObjects = [],
  onObjectSelect,
  onObjectsSelect,
  onObjectsChange,
  onObjectChange,
  onAddComment,
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
  defaultDoorLength,
  defaultDoorFlipH,
  defaultDoorFlipV,
  defaultDoorRotation,
  showDoorId,
  defaultDrawNumber,
  defaultShowNumberOnDrawing,
  onMoveEnd,
  wallShape = 'segment',
}, ref) => {
  const sel = Array.isArray(selectedObjects) ? selectedObjects : [];
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
  const [isResizingWallRect, setIsResizingWallRect] = useState(false);
  const [wallRectHandle, setWallRectHandle] = useState(null); // 'nw' | 'ne' | 'sw' | 'se'
  const [wallRectResizeStart, setWallRectResizeStart] = useState(null);
  const lastMovedObjectsRef = useRef(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const commentInputRef = useRef(null);
  const commentMoveByRightRef = useRef(false); // перетаскивание комментария правой кнопкой — подавить контекстное меню
  const [isMovingByRightButton, setIsMovingByRightButton] = useState(false); // перетаскивание правой кнопкой — не показывать маркеры двери/стены
  const [isJustFinishedRightDrag, setIsJustFinishedRightDrag] = useState(false); // после отпускания мыши после правого перетаскивания — маркеры не показывать до следующего левого клика
  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState(null);

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

  const SNAP_TOLERANCE = 22; // расстояние привязки в мировых единицах (мм); прилипание к концам стен и пересечениям

  // Поиск ближайшей точки привязки (приоритет: пересечения > концы линий > центры объектов > сетка)
  const findSnapPoint = useCallback((x, y) => {
    if (!snapEnabled) return null;

    let nearestPoint = null;
    let minDistance = SNAP_TOLERANCE;
    const walls = objects.filter(o => o.type === 'wall');

    // Пересечения линий (только отрезки стен; прямоугольные стены учитываются по углам ниже)
    for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        const w1 = walls[i], w2 = walls[j];
        if (w1.x1 == null || w2.x1 == null) continue; // прямоугольная стена не имеет x1,y1,x2,y2
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

    // Концы линий (отрезки) и углы прямоугольных стен
    walls.forEach(obj => {
      if (obj.wallShape === 'rectangle' || (obj.width != null && obj.height != null)) {
        const rx = obj.x ?? 0, ry = obj.y ?? 0, rw = obj.width ?? 100, rh = obj.height ?? 50;
        const corners = [[rx, ry], [rx + rw, ry], [rx + rw, ry + rh], [rx, ry + rh]];
        corners.forEach(([cx, cy]) => {
          const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          if (d < minDistance) { minDistance = d; nearestPoint = { x: cx, y: cy }; }
        });
      } else {
        const dist1 = Math.sqrt((x - obj.x1) ** 2 + (y - obj.y1) ** 2);
        const dist2 = Math.sqrt((x - obj.x2) ** 2 + (y - obj.y2) ** 2);
        if (dist1 < minDistance) { minDistance = dist1; nearestPoint = { x: obj.x1, y: obj.y1 }; }
        if (dist2 < minDistance) { minDistance = dist2; nearestPoint = { x: obj.x2, y: obj.y2 }; }
      }
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
    if (w.wallShape === 'rectangle' || (w.width != null && w.height != null)) return null;
    const d1 = Math.sqrt((worldX - w.x1) ** 2 + (worldY - w.y1) ** 2);
    const d2 = Math.sqrt((worldX - w.x2) ** 2 + (worldY - w.y2) ** 2);
    if (d1 <= WALL_HANDLE_R) return 'start';
    if (d2 <= WALL_HANDLE_R) return 'end';
    return null;
  }, [selectedObject]);

  const MIN_WALL_RECT_SIZE = 10;
  const hitTestWallRectHandle = useCallback((worldX, worldY) => {
    if (!selectedObject || selectedObject.type !== 'wall') return null;
    const w = selectedObject;
    if (w.wallShape !== 'rectangle' && (w.width == null || w.height == null)) return null;
    const x = w.x ?? 0;
    const y = w.y ?? 0;
    const width = w.width ?? 100;
    const height = w.height ?? 50;
    const corners = [
      ['nw', x, y],
      ['ne', x + width, y],
      ['sw', x, y + height],
      ['se', x + width, y + height],
    ];
    for (const [handle, hx, hy] of corners) {
      if (Math.sqrt((worldX - hx) ** 2 + (worldY - hy) ** 2) <= WALL_HANDLE_R) return handle;
    }
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

    // Ресайз стены-прямоугольника за угловые маркеры
    if (isResizingWallRect && wallRectHandle && wallRectResizeStart) {
      const { obj, startX, startY, startW, startH } = wallRectResizeStart;
      const mx = svgPoint.x;
      const my = svgPoint.y;
      let newX = startX, newY = startY, newW = startW, newH = startH;
      if (wallRectHandle === 'se') {
        newX = startX;
        newY = startY;
        newW = Math.max(MIN_WALL_RECT_SIZE, mx - startX);
        newH = Math.max(MIN_WALL_RECT_SIZE, my - startY);
      } else if (wallRectHandle === 'sw') {
        newX = mx;
        newY = startY;
        newW = Math.max(MIN_WALL_RECT_SIZE, (startX + startW) - mx);
        newH = Math.max(MIN_WALL_RECT_SIZE, my - startY);
      } else if (wallRectHandle === 'ne') {
        newX = startX;
        newY = my;
        newW = Math.max(MIN_WALL_RECT_SIZE, mx - startX);
        newH = Math.max(MIN_WALL_RECT_SIZE, (startY + startH) - my);
      } else {
        newX = mx;
        newY = my;
        newW = Math.max(MIN_WALL_RECT_SIZE, (startX + startW) - mx);
        newH = Math.max(MIN_WALL_RECT_SIZE, (startY + startH) - my);
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

    // Перемещение объекта/объектов (без добавления в историю на каждый кадр)
    if (isMovingObject && moveStart) {
      const dx = (e.clientX - moveStart.clientX) / viewport.zoom;
      const dy = (e.clientY - moveStart.clientY) / viewport.zoom;
      const noHistory = { addToHistory: false };
      let next;
      if (moveStart.positions && moveStart.positions.length > 0) {
        const posById = new Map(moveStart.positions.map(p => [p.id, p]));
        next = objects.map(o => {
          const pos = posById.get(o.id);
          if (!pos) return o;
          if (o.type === 'wall') {
            if (o.wallShape === 'rectangle' || (o.width != null && o.height != null))
              return { ...o, x: pos.x + dx, y: pos.y + dy };
            return { ...o, x1: pos.x1 + dx, y1: pos.y1 + dy, x2: pos.x2 + dx, y2: pos.y2 + dy };
          }
          return { ...o, x: pos.x + dx, y: pos.y + dy };
        });
      } else {
        const obj = selectedObject;
        if (!obj) return;
        if (obj.type === 'wall') {
          if (obj.wallShape === 'rectangle' || (obj.width != null && obj.height != null)) {
            next = objects.map(o =>
              o.id === obj.id ? { ...o, x: moveStart.objX + dx, y: moveStart.objY + dy } : o
            );
          } else {
            next = objects.map(o =>
              o.id === obj.id
                ? { ...o, x1: moveStart.objX1 + dx, y1: moveStart.objY1 + dy, x2: moveStart.objX2 + dx, y2: moveStart.objY2 + dy }
                : o
            );
          }
        } else {
          next = objects.map(o =>
            o.id === obj.id ? { ...o, x: moveStart.objX + dx, y: moveStart.objY + dy } : o
          );
        }
      }
      lastMovedObjectsRef.current = next;
      onObjectsChange(next, noHistory);
      return;
    }

    if (isMarqueeSelecting && marqueeStart) {
      setMarqueeCurrent(svgPoint);
      return;
    }

    // Рисование стены (отрезок или прямоугольник — превью курсора)
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
    isResizingWallRect,
    wallRectHandle,
    wallRectResizeStart,
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
    wallShape,
    findSnapPoint,
    onSnapPointChange,
    worldToDoorLocal,
    getDoorLeafBounds,
    isMarqueeSelecting,
    marqueeStart,
  ]);

  // Поиск объекта под курсором (сверху вниз по массиву)
  const hitTest = useCallback((x, y) => {
    const tolerance = 8;
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      if (o.type === 'wall') {
        if (o.wallShape === 'rectangle' || (o.width != null && o.height != null)) {
          const thickness = (o.thickness || 5) / 2;
          const rx = o.x ?? 0;
          const ry = o.y ?? 0;
          const rw = o.width ?? 100;
          const rh = o.height ?? 50;
          const t = thickness + tolerance;
          // Попадание только по линиям контура (в пределах t от ребра), не внутри прямоугольника
          const nearTop = y >= ry - t && y <= ry + t && x >= rx - t && x <= rx + rw + t;
          const nearBottom = y >= ry + rh - t && y <= ry + rh + t && x >= rx - t && x <= rx + rw + t;
          const nearLeft = x >= rx - t && x <= rx + t && y >= ry - t && y <= ry + rh + t;
          const nearRight = x >= rx + rw - t && x <= rx + rw + t && y >= ry - t && y <= ry + rh + t;
          if (nearTop || nearBottom || nearLeft || nearRight) return o;
        } else {
          const thickness = (o.thickness || 5) / 2;
          const dx = o.x2 - o.x1, dy = o.y2 - o.y1;
          const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
          const t = Math.max(0, Math.min(1, ((x - o.x1) * dx + (y - o.y1) * dy) / (len * len)));
          const px = o.x1 + t * dx, py = o.y1 + t * dy;
          if (Math.sqrt((x - px) ** 2 + (y - py) ** 2) <= thickness + tolerance) return o;
        }
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
        } else if (type === 'single' || type === 'electric') {
          const { leafX, leafY, leafW, leafH } = getDoorLeafBounds(o);
          hitMinX = leafX;
          hitMaxX = leafX + leafW;
          hitMinY = leafY - leafW;
          hitMaxY = leafY + leafH;
        } else {
          const { leafX, leafY, leafW, leafH } = getDoorLeafBounds(o);
          hitMinX = leafX;
          hitMinY = leafY;
          hitMaxX = leafX + leafW;
          hitMaxY = leafY + leafH;
        }
        const doorTolerance = 0;
        if (localX >= hitMinX - doorTolerance && localX <= hitMaxX + doorTolerance && localY >= hitMinY - doorTolerance && localY <= hitMaxY + doorTolerance) return o;
      }
      if (o.type === 'label' || o.type === 'comment') {
        const fs = o.fontSize || 12;
        const lines = (o.text || '').split('\n');
        const lineCount = Math.max(1, lines.length);
        // Для комментария — кликабельная область на весь текст (перетаскивание ПКМ в любом месте)
        const w = o.type === 'comment' ? 280 : 60;
        const h = o.type === 'comment' ? lineCount * (fs + 2) + 8 : fs + 4;
        const anchor = o.type === 'comment' ? (o.textAnchor || 'start') : 'start';
        const left = anchor === 'middle' ? (o.x ?? 0) - w / 2 : anchor === 'end' ? (o.x ?? 0) - w : (o.x ?? 0);
        if (x >= left - tolerance && x <= left + w + tolerance && y >= (o.y ?? 0) - tolerance && y <= (o.y ?? 0) + h + tolerance) return o;
      }
    }
    return null;
  }, [objects, worldToDoorLocal, getDoorLeafBounds]);

  // Bounding box объекта для проверки попадания в рамку выбора
  const getObjectBBox = useCallback((o) => {
    if (o.type === 'wall') {
      if (o.wallShape === 'rectangle' || (o.width != null && o.height != null)) {
        const x = o.x ?? 0, y = o.y ?? 0, w = o.width ?? 100, h = o.height ?? 50;
        return { minX: x, minY: y, maxX: x + w, maxY: y + h };
      }
      const t = (o.thickness || 5) / 2;
      const x1 = o.x1 ?? 0, y1 = o.y1 ?? 0, x2 = o.x2 ?? x1, y2 = o.y2 ?? y1;
      return {
        minX: Math.min(x1, x2) - t,
        minY: Math.min(y1, y2) - t,
        maxX: Math.max(x1, x2) + t,
        maxY: Math.max(y1, y2) + t,
      };
    }
    if (o.type === 'door') {
      const { leafX, leafY, leafW, leafH } = getDoorLeafBounds(o);
      const type = o.doorType || 'single';
      let minY = leafY;
      if (type === 'single' || type === 'electric') minY = leafY - leafW;
      return { minX: leafX, minY, maxX: leafX + leafW, maxY: leafY + leafH };
    }
    if (o.type === 'label' || o.type === 'comment') {
      const fs = o.fontSize || 12;
      const lines = (o.text || '').split('\n');
      const lineCount = Math.max(1, lines.length);
      const w = o.type === 'comment' ? 280 : 60;
      const h = o.type === 'comment' ? lineCount * (fs + 2) + 8 : fs + 4;
      const anchor = o.type === 'comment' ? (o.textAnchor || 'start') : 'start';
      const left = anchor === 'middle' ? (o.x ?? 0) - w / 2 : anchor === 'end' ? (o.x ?? 0) - w : (o.x ?? 0);
      return { minX: left, minY: o.y ?? 0, maxX: left + w, maxY: (o.y ?? 0) + h };
    }
    return { minX: o.x ?? 0, minY: o.y ?? 0, maxX: (o.x ?? 0) + 1, maxY: (o.y ?? 0) + 1 };
  }, [getDoorLeafBounds]);

  const rectsIntersect = (aMinX, aMinY, aMaxX, aMaxY, bMinX, bMinY, bMaxX, bMaxY) =>
    !(aMaxX < bMinX || bMaxX < aMinX || aMaxY < bMinY || bMaxY < aMinY);

  const getObjectsInRect = useCallback((selMinX, selMinY, selMaxX, selMaxY) => {
    const out = [];
    for (const o of objects) {
      const b = getObjectBBox(o);
      if (rectsIntersect(selMinX, selMinY, selMaxX, selMaxY, b.minX, b.minY, b.maxX, b.maxY)) out.push(o);
    }
    return out;
  }, [objects, getObjectBBox]);

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

    // Правый клик по объекту (комментарий, дверь, стена, метка) — только перетаскивание; у комментария левый клик — редактирование
    if (e.button === 2 && selectedTool === 'select' && mode === 'edit') {
      const hitRight = hitTest(svgPoint.x, svgPoint.y);
      if (hitRight && (hitRight.type === 'comment' || hitRight.type === 'door' || hitRight.type === 'wall' || hitRight.type === 'label')) {
        e.preventDefault();
        e.stopPropagation();
        setIsMovingByRightButton(true);
        if (hitRight.type === 'comment') {
          commentMoveByRightRef.current = true;
          setEditingCommentId(null);
        }
        onObjectSelect(hitRight);
        setMoveStart({
          clientX: e.clientX,
          clientY: e.clientY,
          objX: hitRight.x ?? hitRight.x1,
          objY: hitRight.y ?? hitRight.y1,
          objX1: hitRight.x1,
          objY1: hitRight.y1,
          objX2: hitRight.x2,
          objY2: hitRight.y2,
        });
        setIsMovingObject(true);
        return;
      }
    }

    if (e.button !== 0) return;

    // Инструмент «Вид» — только настройки привязки/сетки, клик по канвасу ничего не делает
    if (selectedTool === 'view') return;

    const pt = findSnapPoint(svgPoint.x, svgPoint.y) || svgPoint;

    // Вставка комментария — обрабатываем до блока «Выбор»; сразу открываем свойства (один обработчик в родителе добавляет и выбирает)
    if (selectedTool === 'comment' && mode === 'edit') {
      e.preventDefault();
      e.stopPropagation();
      const newComment = { id: `comment_${Date.now()}`, type: 'comment', x: pt.x, y: pt.y, text: '', fontSize: 14, textAnchor: 'start' };
      if (onAddComment) {
        onAddComment(newComment);
      } else {
        onObjectsChange([...objects, newComment]);
        onObjectSelect(newComment);
      }
      setEditingCommentId(newComment.id);
      return;
    }

    // Выбор и перемещение (или ресайз одной двери/стены, или рамка выбора нескольких, или перемещение выбранных)
    if (selectedTool === 'select' && mode === 'edit') {
      setIsJustFinishedRightDrag(false);
      const hit = hitTest(svgPoint.x, svgPoint.y);
      const hitInSelection = hit && sel.some(s => s.id === hit.id);
      const singleSelected = sel.length === 1 && selectedObject;

      if (hitInSelection && singleSelected) {
        // Клик по единственному выбранному — ресайз двери/стены по ручкам, если попали
        const wallRectH = hitTestWallRectHandle(svgPoint.x, svgPoint.y);
        if (wallRectH && selectedObject.type === 'wall') {
          e.stopPropagation();
          setIsResizingWallRect(true);
          setWallRectHandle(wallRectH);
          const w = selectedObject;
          setWallRectResizeStart({
            obj: selectedObject,
            startX: w.x ?? 0,
            startY: w.y ?? 0,
            startW: w.width ?? 100,
            startH: w.height ?? 50,
          });
          return;
        }
        const wallEnd = hitTestWallEndpoint(svgPoint.x, svgPoint.y);
        if (wallEnd && selectedObject.type === 'wall') {
          e.stopPropagation();
          setIsResizingWall(true);
          setWallResizeEnd(wallEnd);
          return;
        }
        const handle = hitTestResizeHandle(svgPoint.x, svgPoint.y);
        if (handle && selectedObject.type === 'door') {
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
      }

      const buildMovePositions = (objs) => objs.map(obj => {
        if (obj.type === 'wall') {
          if (obj.wallShape === 'rectangle' || (obj.width != null && obj.height != null))
            return { id: obj.id, x: obj.x ?? 0, y: obj.y ?? 0 };
          return { id: obj.id, x1: obj.x1 ?? 0, y1: obj.y1 ?? 0, x2: obj.x2 ?? obj.x1 ?? 0, y2: obj.y2 ?? obj.y1 ?? 0 };
        }
        return { id: obj.id, x: obj.x ?? 0, y: obj.y ?? 0 };
      });

      if (hitInSelection && sel.length > 0) {
        // Клик по одному из выбранных — начинаем перемещение всех выбранных
        e.stopPropagation();
        setMoveStart({
          clientX: e.clientX,
          clientY: e.clientY,
          positions: buildMovePositions(sel),
        });
        setIsMovingObject(true);
        if (hit.type === 'comment') setEditingCommentId(null);
        return;
      }

      if (hit) {
        onObjectSelect(hit);
        if (hit.type === 'comment') {
          setEditingCommentId(hit.id);
          return;
        }
        if (hit.type === 'door' || hit.type === 'wall') return;
        setMoveStart({
          clientX: e.clientX,
          clientY: e.clientY,
          positions: buildMovePositions([hit]),
        });
        setIsMovingObject(true);
        return;
      }

      // Клик по пустому месту — начинаем рамку выбора (marquee)
      setIsMarqueeSelecting(true);
      setMarqueeStart(svgPoint);
      setMarqueeCurrent(svgPoint);
      setEditingCommentId(null);
      if (!onObjectsSelect) onObjectSelect(null);
      return;
    }

    // Рисование стены (отрезок или прямоугольник)
    if (selectedTool === 'wall' && mode === 'edit') {
      if (!isDrawing) {
        setIsDrawing(true);
        setDrawingStart(pt);
      } else {
        const thickness = defaultWallThickness ?? 5;
        if (wallShape === 'rectangle') {
          const x1 = drawingStart.x;
          const y1 = drawingStart.y;
          const x2 = pt.x;
          const y2 = pt.y;
          const x = Math.min(x1, x2);
          const y = Math.min(y1, y2);
          const width = Math.max(MIN_WALL_RECT_SIZE, Math.abs(x2 - x1));
          const height = Math.max(MIN_WALL_RECT_SIZE, Math.abs(y2 - y1));
          const newWall = {
            id: `wall_${Date.now()}`,
            type: 'wall',
            wallShape: 'rectangle',
            x,
            y,
            width,
            height,
            thickness,
            color: '#333333',
          };
          onObjectsChange([...objects, newWall]);
          onObjectSelect(newWall);
        } else {
          const newWall = {
            id: `wall_${Date.now()}`,
            type: 'wall',
            x1: drawingStart.x,
            y1: drawingStart.y,
            x2: pt.x,
            y2: pt.y,
            thickness,
            color: '#333333',
          };
          onObjectsChange([...objects, newWall]);
          onObjectSelect(newWall);
        }
        setIsDrawing(false);
        setDrawingStart(null);
      }
      return;
    }

    // Вставка двери
    if (selectedTool === 'door' && mode === 'edit') {
      if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number') return;
      const doorType = selectedDoorType || 'single';
      const defaultW = (defaultDoorLength != null ? defaultDoorLength : (DEFAULT_DOOR_WIDTH[doorType] ?? DOOR_WIDTH));
      const gid = selectedDoorId != null ? selectedDoorId : (Array.isArray(doors) && doors[0] ? getGlobalDoorIdFromDoor(doors[0]) : undefined);
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
    onAddComment,
    selectedDoorId,
    selectedDoorType,
    doors,
    defaultWallThickness,
    defaultDoorFlipH,
    defaultDoorFlipV,
    defaultDoorLength,
    defaultDoorRotation,
    defaultDrawNumber,
    defaultShowNumberOnDrawing,
    hitTest,
    hitTestResizeHandle,
    hitTestWallEndpoint,
    hitTestWallRectHandle,
    selectedObject,
    selectedObjects,
    getObjectsInRect,
    onObjectsSelect,
    wallShape,
  ]);

  // Обработка отпускания мыши
  const handleMouseUp = useCallback((e) => {
    if (isMarqueeSelecting && marqueeStart && onObjectsSelect && e != null && typeof e.clientX === 'number') {
      const endPt = getSVGPoint(e.clientX, e.clientY);
      if (endPt) {
        const selMinX = Math.min(marqueeStart.x, endPt.x);
        const selMinY = Math.min(marqueeStart.y, endPt.y);
        const selMaxX = Math.max(marqueeStart.x, endPt.x);
        const selMaxY = Math.max(marqueeStart.y, endPt.y);
        const objs = getObjectsInRect(selMinX, selMinY, selMaxX, selMaxY);
        onObjectsSelect(objs);
      }
      setIsMarqueeSelecting(false);
      setMarqueeStart(null);
      setMarqueeCurrent(null);
    }
    if (isMovingObject && onMoveEnd && lastMovedObjectsRef.current) {
      onMoveEnd(lastMovedObjectsRef.current);
      lastMovedObjectsRef.current = null;
    }
    commentMoveByRightRef.current = false;
    if (isMovingByRightButton) setIsJustFinishedRightDrag(true);
    setIsMovingByRightButton(false);
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
    setIsResizingWallRect(false);
    setWallRectHandle(null);
    setWallRectResizeStart(null);
  }, [isMarqueeSelecting, marqueeStart, getSVGPoint, getObjectsInRect, onObjectsSelect, isMovingObject, onMoveEnd, isMovingByRightButton]);

  // Обработка контекстного меню (отключение для правой кнопки мыши)
  const handleContextMenu = useCallback((e) => {
    // Не показывать контекстное меню браузера на канвасе: при панорамировании, перетаскивании объекта или правом клике по комментарию (перемещение)
    if (isPanning || isMovingObject || commentMoveByRightRef.current) {
      e.preventDefault();
      return;
    }
    // На всей области карты отключаем контекстное меню, чтобы не мешало работе с объектами
    e.preventDefault();
  }, [isPanning, isMovingObject]);

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

  // Закрыть редактор комментария при смене объекта/режима; открытие редактора — только по левому клику в handleMouseDown
  useEffect(() => {
    if (mode !== 'edit' || selectedObject?.type !== 'comment') {
      setEditingCommentId(null);
    }
  }, [mode, selectedObject?.id, selectedObject?.type]);

  // Фокус в поле комментария и курсор в конец при открытии редактора (после отрисовки textarea)
  useEffect(() => {
    if (!editingCommentId) return;
    const id = requestAnimationFrame(() => {
      const input = commentInputRef.current;
      if (!input) return;
      input.focus();
      const len = (input.value || '').length;
      input.setSelectionRange(len, len);
    });
    return () => cancelAnimationFrame(id);
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
        const gid = getGlobalDoorIdFromDoor(dr);
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
    const selected = sel.some(s => s.id === obj.id);
    // Маркеры редактирования — только при левом клике (редактирование); при перетаскивании правой кнопкой и после него маркеры не показываем
    const showEditHandles = selected && selectedTool === 'select' && mode === 'edit' && !isMovingByRightButton && !isJustFinishedRightDrag;
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
    const leafW = lw;
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
        const selected = selectedObject?.id === obj.id && selectedTool === 'select' && mode === 'edit';
        const showWallHandles = selected && !isMovingByRightButton && !isJustFinishedRightDrag;
        const showSelectedStyle = selected && !isMovingByRightButton && !isJustFinishedRightDrag;
        const thickness = obj.thickness || 5;
        const color = obj.color || '#333333';

        if (obj.wallShape === 'rectangle' || (obj.width != null && obj.height != null)) {
          const rx = obj.x ?? 0;
          const ry = obj.y ?? 0;
          const rw = obj.width ?? 100;
          const rh = obj.height ?? 50;
          // Один замкнутый path вместо четырёх линий — углы стыкуются без «ступенек»
          const pathD = `M ${rx},${ry} L ${rx + rw},${ry} L ${rx + rw},${ry + rh} L ${rx},${ry + rh} Z`;
          return (
            <g key={obj.id}>
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={thickness}
                strokeLinejoin="miter"
                strokeLinecap="butt"
                className={showSelectedStyle ? 'selected' : ''}
                onClick={(ev) => { ev.stopPropagation(); onObjectSelect(obj); }}
              />
              {showWallHandles && (
                <>
                  {[['nw', rx, ry], ['ne', rx + rw, ry], ['sw', rx, ry + rh], ['se', rx + rw, ry + rh]].map(([_, hx, hy]) => (
                    <circle
                      key={_}
                      cx={hx}
                      cy={hy}
                      r={WALL_HANDLE_R}
                      fill="none"
                      stroke="#007bff"
                      strokeWidth={2}
                      className="wall-endpoint-handle"
                      onClick={(ev) => ev.stopPropagation()}
                    />
                  ))}
                </>
              )}
            </g>
          );
        }

        return (
          <g key={obj.id}>
            <line
              x1={obj.x1}
              y1={obj.y1}
              x2={obj.x2}
              y2={obj.y2}
              stroke={color}
              strokeWidth={thickness}
              strokeLinecap="round"
              className={showSelectedStyle ? 'selected' : ''}
              onClick={(ev) => { ev.stopPropagation(); onObjectSelect(obj); }}
            />
            {showWallHandles && (
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
            className={sel.some(s => s.id === obj.id) ? 'selected' : ''}
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
            className={sel.some(s => s.id === obj.id) ? 'selected' : ''}
            style={{ cursor: 'pointer' }}
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
          if (obj.wallShape === 'rectangle' || (obj.width != null && obj.height != null)) {
            const rx = obj.x ?? 0, ry = obj.y ?? 0, rw = obj.width ?? 100, rh = obj.height ?? 50;
            minX = Math.min(minX, rx, rx + rw);
            minY = Math.min(minY, ry, ry + rh);
            maxX = Math.max(maxX, rx, rx + rw);
            maxY = Math.max(maxY, ry, ry + rh);
          } else {
            minX = Math.min(minX, obj.x1, obj.x2);
            minY = Math.min(minY, obj.y1, obj.y2);
            maxX = Math.max(maxX, obj.x1, obj.x2);
            maxY = Math.max(maxY, obj.y1, obj.y2);
          }
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
    // Центр бокса в мировых координатах — показываем в центре окна
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const newX = centerX - w / (2 * zoom);
    const newY = centerY - h / (2 * zoom);
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
          {isDrawing && drawingStart && currentMousePos && selectedTool === 'wall' && (
            wallShape === 'rectangle' ? (
              <rect
                x={Math.min(drawingStart.x, currentMousePos.x)}
                y={Math.min(drawingStart.y, currentMousePos.y)}
                width={Math.abs(currentMousePos.x - drawingStart.x)}
                height={Math.abs(currentMousePos.y - drawingStart.y)}
                fill="none"
                stroke="#007bff"
                strokeWidth={5}
                strokeDasharray="5,5"
                className="drawing-preview"
              />
            ) : (
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
            )
          )}
          {isMarqueeSelecting && marqueeStart && marqueeCurrent && (
            <rect
              x={Math.min(marqueeStart.x, marqueeCurrent.x)}
              y={Math.min(marqueeStart.y, marqueeCurrent.y)}
              width={Math.abs(marqueeCurrent.x - marqueeStart.x)}
              height={Math.abs(marqueeCurrent.y - marqueeStart.y)}
              fill="rgba(0, 123, 255, 0.08)"
              stroke="#007bff"
              strokeWidth={2}
              strokeDasharray="6,4"
              className="marquee-selection"
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
