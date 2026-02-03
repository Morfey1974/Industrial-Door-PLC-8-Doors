/**
 * Панель инструментов справа
 */

import { useRef, useEffect } from 'react';
import { calculateGlobalDoorId } from '../../utils/configValidator';
import './MappingToolbar.css';

const MappingToolbar = ({
  selectedTool,
  onToolSelect,
  selectedObject,
  selectedObjects = [],
  onObjectChange,
  onDelete,
  snapEnabled,
  onSnapEnabledChange,
  gridEnabled,
  onGridEnabledChange,
  gridSize,
  onGridSizeChange,
  doors,
  selectedDoorId,
  onSelectedDoorIdChange,
  selectedDoorType,
  onSelectedDoorTypeChange,
  defaultDoorLength,
  onDefaultDoorLengthChange,
  defaultWallThickness,
  onDefaultWallThicknessChange,
  wallShape,
  onWallShapeChange,
  defaultWallRectWidth,
  defaultWallRectHeight,
  onDefaultWallRectWidthChange,
  onDefaultWallRectHeightChange,
  defaultWallSegmentLength,
  onDefaultWallSegmentLengthChange,
  defaultDoorFlipH,
  defaultDoorFlipV,
  defaultDoorRotation,
  onDefaultDoorFlipHChange,
  onDefaultDoorFlipVChange,
  onDefaultDoorRotationChange,
  showDoorId,
  onShowDoorIdChange,
  defaultDrawNumber,
  defaultShowNumberOnDrawing,
  onDefaultDrawNumberChange,
  onDefaultShowNumberOnDrawingChange,
}) => {
  const sel = Array.isArray(selectedObjects) ? selectedObjects : [];
  const doorList = Array.isArray(doors)
    ? doors
    : (doors && Array.isArray(doors.doors) ? doors.doors : doors && Array.isArray(doors.data) ? doors.data : []) || [];
  /** Числовой globalDoorId для значения выбора и привязки двери на карте (ID-2-1 → 9) */
  const getDoorId = (d) => {
    if (!d) return undefined;
    if (d.globalDoorId != null) return Number(d.globalDoorId);
    const nodeId = d.nodeId ?? 1;
    const localDoor = d.localDoor ?? d?.localDoorId;
    if (localDoor != null) return calculateGlobalDoorId(nodeId, localDoor);
    return d?.id ?? d?.doorId;
  };
  /** Подпись для выбора двери: ID-{nodeId}-{localDoor} */
  const getDoorOptionLabel = (d) => {
    const idStr = d ? `ID-${d.nodeId ?? 1}-${d.localDoor ?? d?.localDoorId ?? getDoorId(d) ?? '-'}` : '—';
    const extra = d?.label ?? d?.name ?? d?.comment;
    return extra ? `${idStr} (${extra})` : idStr;
  };
  const DOOR_TYPES = [
    { id: 'single', label: 'Одностворчатая дверь' },
    { id: 'double', label: 'Двухстворчатая дверь' },
    { id: 'sliding', label: 'Раздвижная дверь' },
    { id: 'electric', label: 'Дверь с электродоводчиком' },
  ];
  /** Длины двери по умолчанию по типу (мм) при вставке */
  const DEFAULT_DOOR_WIDTH = { single: 90, double: 120, sliding: 120, electric: 90 };
  const ROTATION_PRESETS = [90, 180, 270];
  const tools = [
    { id: 'select', label: 'Выбор', icon: '↖' },
    { id: 'wall', label: 'Стена', icon: '━' },
    { id: 'door', label: 'Дверь', icon: '🚪' },
    { id: 'cardreader', label: 'CARD READER', icon: '🔑' },
    { id: 'comment', label: 'Комментарий', icon: '💬' },
    { id: 'view', label: 'Вид', icon: '⊞' },
  ];
  const toolbarRef = useRef(null);
  const propertiesSectionRef = useRef(null);

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!el.contains(e.target)) return;
      e.stopPropagation();
      e.preventDefault();
      el.scrollTop += e.deltaY;
    };
    document.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => document.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  // При выборе инструмента «Комментарий» прокручиваем к блоку «Свойства», чтобы он был виден
  useEffect(() => {
    if (selectedTool === 'comment' && propertiesSectionRef.current) {
      propertiesSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedTool]);

  return (
    <div ref={toolbarRef} className="mapping-toolbar">
      <div className="toolbar-section">
        <h3 className="toolbar-section-title">Инструменты</h3>
        <div className="toolbar-tools">
          {tools.map(tool => (
            <button
              key={tool.id}
              className={`toolbar-tool ${selectedTool === tool.id ? 'active' : ''}`}
              onClick={() => onToolSelect(tool.id)}
              title={tool.label}
            >
              <span className="tool-icon">{tool.icon}</span>
              <span className="tool-label">{tool.label}</span>
            </button>
          ))}
        </div>
      </div>

      {selectedTool === 'wall' && (
        <div className="toolbar-section">
          <h3 className="toolbar-section-title">Форма стены</h3>
          <div className="toolbar-setting toolbar-wall-shapes">
            <button
              type="button"
              className={`toolbar-action ${wallShape === 'segment' ? 'active' : ''}`}
              onClick={() => onWallShapeChange?.('segment')}
              title="Прямая стена (отрезок)"
            >
              Отрезок
            </button>
            <button
              type="button"
              className={`toolbar-action ${wallShape === 'rectangle' ? 'active' : ''}`}
              onClick={() => onWallShapeChange?.('rectangle')}
              title="Замкнутая стена (прямоугольник)"
            >
              Прямоугольник
            </button>
          </div>
          <h3 className="toolbar-section-title">Толщина новой стены</h3>
          <div className="toolbar-setting">
            <label>
              Толщина (мм):
              <input
                type="number"
                min="1"
                max="20"
                value={defaultWallThickness ?? 5}
                onChange={(e) => onDefaultWallThicknessChange?.(Number(e.target.value))}
              />
            </label>
          </div>
        </div>
      )}

      {selectedTool === 'door' && (
        <div className="toolbar-section">
          <h3 className="toolbar-section-title">Тип двери</h3>
          <div className="toolbar-door-types">
            {DOOR_TYPES.map((dt) => (
              <button
                key={dt.id}
                type="button"
                className={`toolbar-door-type ${selectedDoorType === dt.id ? 'active' : ''}`}
                onClick={() => onSelectedDoorTypeChange(dt.id)}
                title={dt.label}
              >
                {dt.label}
              </button>
            ))}
          </div>
          <div className="toolbar-setting">
            <label>
              Дверь (плата–дверь):
              <select
                value={selectedDoorId ?? ''}
                onChange={(e) => onSelectedDoorIdChange(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— не выбрана —</option>
                {(doorList || []).map((d) => (
                  <option key={getDoorId(d) ?? 'noid'} value={getDoorId(d)}>{getDoorOptionLabel(d)}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="toolbar-setting">
            <label>
              Номер на чертеже:
              <input
                type="text"
                value={defaultDrawNumber ?? ''}
                onChange={(e) => onDefaultDrawNumberChange?.(e.target.value)}
                placeholder="№"
              />
            </label>
            <label className="toolbar-checkbox">
              <input
                type="checkbox"
                checked={defaultShowNumberOnDrawing ?? false}
                onChange={(e) => onDefaultShowNumberOnDrawingChange?.(e.target.checked)}
              />
              <span>Видимость на чертеже</span>
            </label>
          </div>
          <div className="toolbar-setting">
            <label className="toolbar-checkbox">
              <input
                type="checkbox"
                checked={showDoorId ?? false}
                onChange={(e) => onShowDoorIdChange?.(e.target.checked)}
              />
              <span>Отображать ID двери</span>
            </label>
          </div>
          <h3 className="toolbar-section-title">Положение новой двери</h3>
          <div className="toolbar-setting">
            <span className="property-label">Отразить / Поворот</span>
          </div>
          <div className="toolbar-actions" style={{ flexWrap: 'wrap', gap: 4 }}>
            <button
              type="button"
              className={`toolbar-action ${defaultDoorFlipH ? 'active' : ''}`}
              onClick={() => onDefaultDoorFlipHChange?.(!defaultDoorFlipH)}
              title="Отразить слева направо"
            >
              ⇄ Г
            </button>
            <button
              type="button"
              className={`toolbar-action ${defaultDoorFlipV ? 'active' : ''}`}
              onClick={() => onDefaultDoorFlipVChange?.(!defaultDoorFlipV)}
              title="Отразить сверху вниз"
            >
              ⇅ В
            </button>
            {ROTATION_PRESETS.map((deg) => (
              <button
                key={deg}
                type="button"
                className="toolbar-action"
                onClick={() => onDefaultDoorRotationChange?.(((defaultDoorRotation ?? 0) + deg) % 360)}
                title={`Поворот ${deg}°`}
              >
                {deg}°
              </button>
            ))}
          </div>
          <div className="toolbar-setting">
            <label>
              Угол (°):
              <input
                type="number"
                min="0"
                max="360"
                step="15"
                value={defaultDoorRotation ?? 0}
                onChange={(e) => onDefaultDoorRotationChange?.((Number(e.target.value) % 360 + 360) % 360)}
              />
            </label>
          </div>
          <div className="toolbar-setting">
            <label>
              Длина двери (мм):
              <input
                type="number"
                min="1"
                value={defaultDoorLength ?? ''}
                onChange={(e) => onDefaultDoorLengthChange?.(e.target.value === '' ? null : Math.max(1, Number(e.target.value)))}
                placeholder={String(DEFAULT_DOOR_WIDTH[selectedDoorType] ?? 90)}
                title="Пусто = по умолчанию для типа (90/120 мм)"
              />
            </label>
          </div>
        </div>
      )}

      {selectedTool === 'view' && (
        <>
          <div className="toolbar-section">
            <h3 className="toolbar-section-title">Привязка</h3>
            <div className="toolbar-setting">
              <label className="toolbar-checkbox">
                <input
                  type="checkbox"
                  checked={snapEnabled}
                  onChange={(e) => onSnapEnabledChange(e.target.checked)}
                />
                <span>Включить привязку</span>
              </label>
            </div>
          </div>
          <div className="toolbar-section">
            <h3 className="toolbar-section-title">Сетка</h3>
            <div className="toolbar-setting">
              <label className="toolbar-checkbox">
                <input
                  type="checkbox"
                  checked={gridEnabled}
                  onChange={(e) => onGridEnabledChange(e.target.checked)}
                />
                <span>Показать сетку</span>
              </label>
            </div>
            <div className="toolbar-setting">
              <label>
                Размер ячейки: {gridSize} мм
                <input
                  type="range"
                  min="5"
                  max="100"
                  value={gridSize}
                  onChange={(e) => onGridSizeChange(Number(e.target.value))}
                  disabled={!gridEnabled}
                />
              </label>
            </div>
          </div>
        </>
      )}

      {/* Свойства выбранного объекта ИЛИ «Выбрано N объектов» ИЛИ параметры инструмента */}
      {(selectedObject || sel.length > 1 || (selectedTool === 'wall' && (wallShape === 'rectangle' || wallShape === 'segment')) || selectedTool === 'comment' || selectedTool === 'cardreader') && (
        <div ref={propertiesSectionRef} className="toolbar-section toolbar-section-properties">
          <h3 className="toolbar-section-title">
            {sel.length > 1
              ? `Выбрано объектов: ${sel.length}`
              : selectedObject
                ? 'Свойства'
                : selectedTool === 'comment'
                  ? 'Комментарий'
                : selectedTool === 'cardreader'
                  ? 'CARD READER'
                  : wallShape === 'rectangle'
                    ? 'Параметры прямоугольника'
                    : 'Параметры отрезка'}
          </h3>
          <div className="toolbar-properties">
            {sel.length > 1 ? (
              <>
                <p className="toolbar-placeholder" style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary, #666)' }}>
                  Перетащите выбранные объекты на карте или удалите.
                </p>
                <button type="button" className="toolbar-action danger" onClick={onDelete}>
                  🗑 Удалить все
                </button>
              </>
            ) : selectedObject ? (
              <>
            <div className="property-item">
              <span className="property-label">Тип:</span>
              <span className="property-value">
                {selectedObject.type === 'wall' && 'Стена'}
                {selectedObject.type === 'door' && 'Дверь'}
                {selectedObject.type === 'cardreader' && 'CARD READER'}
                {selectedObject.type === 'label' && 'Номер'}
                {selectedObject.type === 'comment' && 'Комментарий'}
                {!['wall','door','cardreader','label','comment'].includes(selectedObject.type) && selectedObject.type}
              </span>
            </div>
            {(selectedObject.type === 'wall') && (
              <>
                <div className="property-item">
                  <span className="property-label">Толщина (мм):</span>
                  <input
                    type="number"
                    value={selectedObject.thickness ?? 5}
                    onChange={(e) => onObjectChange({
                      ...selectedObject,
                      thickness: Number(e.target.value),
                    })}
                    min="1"
                    max="20"
                  />
                </div>
                {/* Стена-отрезок: длина в мм (вычисляется из x1,y1,x2,y2; при изменении пересчитываем конец отрезка) */}
                {(selectedObject.wallShape !== 'rectangle' && selectedObject.width == null && selectedObject.height == null) && (
                  <div className="property-item">
                    <span className="property-label">Длина (мм):</span>
                    <input
                      type="number"
                      value={Math.round(
                        Math.sqrt(
                          ((selectedObject.x2 ?? selectedObject.x1) - (selectedObject.x1 ?? 0)) ** 2 +
                          ((selectedObject.y2 ?? selectedObject.y1) - (selectedObject.y1 ?? 0)) ** 2
                        )
                      )}
                      onChange={(e) => {
                        const L = Math.max(1, Number(e.target.value));
                        const x1 = selectedObject.x1 ?? 0;
                        const y1 = selectedObject.y1 ?? 0;
                        const x2 = selectedObject.x2 ?? x1;
                        const y2 = selectedObject.y2 ?? y1;
                        const dx = x2 - x1;
                        const dy = y2 - y1;
                        const curLen = Math.sqrt(dx * dx + dy * dy) || 1;
                        const k = L / curLen;
                        onObjectChange({
                          ...selectedObject,
                          x2: x1 + dx * k,
                          y2: y1 + dy * k,
                        });
                      }}
                      min="1"
                    />
                  </div>
                )}
                {(selectedObject.wallShape === 'rectangle' || (selectedObject.width != null && selectedObject.height != null)) && (
                  <>
                    <div className="property-item">
                      <span className="property-label">Длина (мм):</span>
                      <input
                        type="number"
                        value={selectedObject.width ?? 100}
                        onChange={(e) => onObjectChange({
                          ...selectedObject,
                          width: Math.max(10, Number(e.target.value)),
                        })}
                        min="10"
                      />
                    </div>
                    <div className="property-item">
                      <span className="property-label">Ширина (мм):</span>
                      <input
                        type="number"
                        value={selectedObject.height ?? 50}
                        onChange={(e) => onObjectChange({
                          ...selectedObject,
                          height: Math.max(10, Number(e.target.value)),
                        })}
                        min="10"
                      />
                    </div>
                  </>
                )}
              </>
            )}
            {selectedObject.type === 'door' && (
              <>
                <div className="property-item">
                  <span className="property-label">Тип:</span>
                  <select
                    value={selectedObject.doorType ?? 'single'}
                    onChange={(e) => onObjectChange({ ...selectedObject, doorType: e.target.value })}
                  >
                    {DOOR_TYPES.map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <div className="property-item">
                  <span className="property-label">Длина двери (мм):</span>
                  <input
                    type="number"
                    min="1"
                    value={selectedObject.width ?? DEFAULT_DOOR_WIDTH[selectedObject.doorType] ?? 90}
                    onChange={(e) => onObjectChange({
                      ...selectedObject,
                      width: Math.max(1, Number(e.target.value)),
                    })}
                    title="Длина проёма двери"
                  />
                </div>
                <div className="property-item">
                  <span className="property-label">Отразить / Поворот</span>
                </div>
                <div className="toolbar-actions" style={{ flexWrap: 'wrap', gap: 4 }}>
                  <button
                    type="button"
                    className="toolbar-action"
                    onClick={() => onObjectChange({ ...selectedObject, flipH: !(selectedObject.flipH ?? false) })}
                    title="Отразить слева направо"
                  >
                    ⇄ Г
                  </button>
                  <button
                    type="button"
                    className="toolbar-action"
                    onClick={() => onObjectChange({ ...selectedObject, flipV: !(selectedObject.flipV ?? false) })}
                    title="Отразить сверху вниз"
                  >
                    ⇅ В
                  </button>
                  {ROTATION_PRESETS.map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      className="toolbar-action"
                      onClick={() => onObjectChange({ ...selectedObject, rotation: ((selectedObject.rotation ?? 0) + deg) % 360 })}
                      title={`Поворот ${deg}°`}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
                <div className="property-item">
                  <label>
                    Угол (°):
                    <input
                      type="number"
                      min="0"
                      max="360"
                      step="15"
                      value={selectedObject.rotation ?? 0}
                      onChange={(e) => onObjectChange({ ...selectedObject, rotation: (Number(e.target.value) % 360 + 360) % 360 })}
                    />
                  </label>
                </div>
                <div className="property-item">
                  <span className="property-label">Дверь (плата–дверь):</span>
                  <select
                    value={selectedObject.globalDoorId === 0 || selectedObject.globalDoorId == null ? '' : String(selectedObject.globalDoorId)}
                    onChange={(e) => onObjectChange({
                      ...selectedObject,
                      globalDoorId: e.target.value === '' ? 0 : Number(e.target.value),
                    })}
                  >
                    <option value="">—</option>
                    {(doorList || []).map((d) => (
                      <option key={getDoorId(d) ?? 'noid'} value={getDoorId(d)}>{getDoorOptionLabel(d)}</option>
                    ))}
                  </select>
                </div>
                <div className="property-item">
                  <span className="property-label">Номер на чертеже:</span>
                  <input
                    type="text"
                    value={selectedObject.drawNumber ?? ''}
                    onChange={(e) => onObjectChange({ ...selectedObject, drawNumber: e.target.value })}
                    placeholder="№"
                  />
                </div>
                <div className="property-item">
                  <label className="toolbar-checkbox toolbar-checkbox-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedObject.showNumberOnDrawing ?? false}
                      onChange={(e) => onObjectChange({ ...selectedObject, showNumberOnDrawing: e.target.checked })}
                    />
                    <span className="toolbar-checkbox-text">Видимость номера на чертеже</span>
                  </label>
                </div>
                <div className="property-item">
                  <label className="toolbar-checkbox toolbar-checkbox-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedObject.showDoorIdOnDrawing ?? false}
                      onChange={(e) => onObjectChange({ ...selectedObject, showDoorIdOnDrawing: e.target.checked })}
                    />
                    <span className="toolbar-checkbox-text">Видимость ID</span>
                  </label>
                </div>
              </>
            )}
            {(selectedObject.type === 'cardreader') && (
              <>
                <div className="property-item">
                  <span className="property-label">Имя на карте:</span>
                  <input
                    type="text"
                    value={selectedObject.text ?? 'CARD READER'}
                    onChange={(e) => onObjectChange({ ...selectedObject, text: e.target.value.slice(0, 64) })}
                    onKeyDown={(e) => { e.stopPropagation(); }}
                    maxLength={64}
                    placeholder="CARD READER"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '4px 4px' }}
                  />
                </div>
                <div className="property-item">
                  <span className="property-label">Размер шрифта:</span>
                  <input
                    type="number"
                    min="8"
                    max="24"
                    value={selectedObject.fontSize ?? 12}
                    onChange={(e) => onObjectChange({ ...selectedObject, fontSize: Math.max(8, Math.min(24, Number(e.target.value) || 12)) })}
                  />
                </div>
              </>
            )}
            {(selectedObject.type === 'label' || selectedObject.type === 'comment') && (
              <>
                <div className="property-item">
                  <span className="property-label">Текст:</span>
                  {selectedObject.type === 'comment' ? (
                    <textarea
                      value={selectedObject.text ?? ''}
                      onChange={(e) => onObjectChange({ ...selectedObject, text: e.target.value.slice(0, 500) })}
                      onKeyDown={(e) => { e.stopPropagation(); }}
                      maxLength={500}
                      rows={3}
                      style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '4px 4px' }}
                      title="До 500 символов"
                    />
                  ) : (
                    <input
                      type="text"
                      value={selectedObject.text ?? ''}
                      onChange={(e) => onObjectChange({ ...selectedObject, text: e.target.value })}
                      onKeyDown={(e) => { e.stopPropagation(); }}
                    />
                  )}
                </div>
                <div className="property-item">
                  <span className="property-label">Размер шрифта:</span>
                  <input
                    type="number"
                    value={selectedObject.fontSize ?? 12}
                    onChange={(e) => onObjectChange({ ...selectedObject, fontSize: Number(e.target.value) })}
                    min="8"
                    max="24"
                  />
                </div>
                {selectedObject.type === 'comment' && (
                  <div className="property-item">
                    <span className="property-label">Выравнивание:</span>
                    <div className="toolbar-actions" style={{ flexWrap: 'wrap', gap: 4 }}>
                      <button
                        type="button"
                        className={`toolbar-action ${(selectedObject.textAnchor ?? 'start') === 'start' ? 'active' : ''}`}
                        onClick={() => onObjectChange({ ...selectedObject, textAnchor: 'start' })}
                        title="Влево"
                      >
                        Влево
                      </button>
                      <button
                        type="button"
                        className={`toolbar-action ${(selectedObject.textAnchor ?? 'start') === 'middle' ? 'active' : ''}`}
                        onClick={() => onObjectChange({ ...selectedObject, textAnchor: 'middle' })}
                        title="По центру"
                      >
                        По центру
                      </button>
                      <button
                        type="button"
                        className={`toolbar-action ${(selectedObject.textAnchor ?? 'start') === 'end' ? 'active' : ''}`}
                        onClick={() => onObjectChange({ ...selectedObject, textAnchor: 'end' })}
                        title="Вправо"
                      >
                        Вправо
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            <button
              className="toolbar-action danger"
              onClick={onDelete}
            >
              🗑 Удалить
            </button>
          </>
            ) : selectedTool === 'comment' ? (
              <p className="toolbar-placeholder">Кликните по карте, чтобы вставить комментарий.</p>
            ) : wallShape === 'rectangle' ? (
              <>
                <div className="property-item">
                  <span className="property-label">Длина (мм):</span>
                  <input
                    type="number"
                    value={defaultWallRectWidth ?? 100}
                    onChange={(e) => onDefaultWallRectWidthChange?.(Math.max(10, Number(e.target.value)))}
                    min="10"
                  />
                </div>
                <div className="property-item">
                  <span className="property-label">Ширина (мм):</span>
                  <input
                    type="number"
                    value={defaultWallRectHeight ?? 50}
                    onChange={(e) => onDefaultWallRectHeightChange?.(Math.max(10, Number(e.target.value)))}
                    min="10"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="property-item">
                  <span className="property-label">Длина (мм):</span>
                  <input
                    type="number"
                    value={defaultWallSegmentLength ?? 100}
                    onChange={(e) => onDefaultWallSegmentLengthChange?.(Math.max(1, Number(e.target.value)))}
                    min="1"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MappingToolbar;
