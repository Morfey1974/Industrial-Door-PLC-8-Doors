/**
 * DoorEditModal - модальное окно редактирования двери
 */

import { useState, useEffect } from 'react';
import Button from '../../../components/common/Button';
import { calculateGlobalDoorId } from '../../../utils/configValidator';

const DoorEditModal = ({ door, existingDoors, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    techId: '',
    drawingId: '',
    nodeId: 1,
    localDoor: 1,
    type: 'NC',
    comment: '',
  });
  
  const [errors, setErrors] = useState({});
  
  // Инициализация формы при открытии
  useEffect(() => {
    if (door) {
      setFormData({
        techId: door.techId || '',
        drawingId: door.drawingId || '',
        nodeId: door.nodeId || 1,
        localDoor: door.localDoor || 1,
        type: door.type || 'NC',
        comment: door.comment || '',
      });
    }
  }, [door]);
  
  // Вычисляем globalDoorId при изменении nodeId или localDoor
  const globalDoorId = calculateGlobalDoorId(formData.nodeId, formData.localDoor);
  
  // Валидация формы
  const validate = () => {
    const newErrors = {};
    
    // Определяем techId текущей редактируемой двери (если редактируем существующую)
    // techId используется как уникальный идентификатор двери и не должен меняться при редактировании
    const editingDoorTechId = door && door.techId !== undefined && door.techId !== null 
      ? parseInt(door.techId, 10) 
      : null;
    
    if (!formData.techId || formData.techId < 1) {
      newErrors.techId = 'TechId должен быть положительным числом';
    } else {
      const techIdNum = parseInt(formData.techId, 10);
      // existingDoors уже должен быть отфильтрован и не содержать редактируемую дверь
      // Но на всякий случай проверяем еще раз по techId
      const duplicate = existingDoors.find(
        d => {
          const dTechId = parseInt(d.techId, 10);
          return dTechId === techIdNum && dTechId !== editingDoorTechId;
        }
      );
      if (duplicate) {
        newErrors.techId = `TechId ${formData.techId} уже используется`;
      }
    }
    
    if (!formData.nodeId || formData.nodeId < 1 || formData.nodeId > 10) {
      newErrors.nodeId = 'NodeId должен быть от 1 до 10';
    }
    
    if (!formData.localDoor || formData.localDoor < 1 || formData.localDoor > 8) {
      newErrors.localDoor = 'LocalDoor должен быть от 1 до 8';
    }
    
    // Проверка уникальности пары nodeId+localDoor
    // existingDoors уже должен быть отфильтрован и не содержать редактируемую дверь
    // Но на всякий случай проверяем еще раз по techId
    if (formData.nodeId && formData.localDoor) {
      const duplicate = existingDoors.find(
        d => {
          const dNodeId = parseInt(d.nodeId, 10);
          const dLocalDoor = parseInt(d.localDoor, 10);
          const dTechId = parseInt(d.techId, 10);
          return dNodeId === formData.nodeId && 
                 dLocalDoor === formData.localDoor &&
                 dTechId !== editingDoorTechId; // Исключаем текущую редактируемую дверь
        }
      );
      if (duplicate) {
        newErrors.nodeId = `Дверь на плате ${formData.nodeId}, позиция ${formData.localDoor} уже существует`;
      }
    }
    
    if (!formData.type || !['NC', 'NO', 'CARD_READER'].includes(formData.type)) {
      newErrors.type = 'Тип двери должен быть NC, NO или CARD_READER';
    }
    
    if (formData.comment && formData.comment.length > 32) {
      newErrors.comment = 'Комментарий не может быть длиннее 32 символов';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  // Обработка изменения полей
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Очищаем ошибку для этого поля
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };
  
  // Сохранение
  const handleSave = () => {
    if (!validate()) {
      return;
    }
    
    const doorData = {
      ...formData,
      techId: parseInt(formData.techId, 10),
      drawingId: parseInt(formData.drawingId || 0, 10),
      nodeId: parseInt(formData.nodeId, 10),
      localDoor: parseInt(formData.localDoor, 10),
      globalDoorId,
      typeCode: formData.type === 'NC' ? 0 : formData.type === 'NO' ? 1 : 2,
    };
    
    onSave(doorData);
  };
  
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{door.techId ? 'Редактирование двери' : 'Добавление двери'}</h3>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>
        
        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="techId">
              Tech ID <span className="required">*</span>
            </label>
            <input
              id="techId"
              type="number"
              value={formData.techId}
              onChange={(e) => handleChange('techId', e.target.value)}
              min={1}
              className={`form-input ${errors.techId ? 'error' : ''}`}
            />
            {errors.techId && <span className="error-message">{errors.techId}</span>}
          </div>
          
          <div className="form-group">
            <label htmlFor="drawingId">Drawing ID</label>
            <input
              id="drawingId"
              type="number"
              value={formData.drawingId}
              onChange={(e) => handleChange('drawingId', e.target.value)}
              min={0}
              className="form-input"
            />
            <small>Идентификатор на плане (опционально)</small>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="nodeId">
                Плата (Node ID) <span className="required">*</span>
              </label>
              <select
                id="nodeId"
                value={formData.nodeId}
                onChange={(e) => handleChange('nodeId', parseInt(e.target.value, 10))}
                className={`form-input ${errors.nodeId ? 'error' : ''}`}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(id => (
                  <option key={id} value={id}>Плата {id}</option>
                ))}
              </select>
              {errors.nodeId && <span className="error-message">{errors.nodeId}</span>}
            </div>
            
            <div className="form-group">
              <label htmlFor="localDoor">
                Локальная дверь <span className="required">*</span>
              </label>
              <select
                id="localDoor"
                value={formData.localDoor}
                onChange={(e) => handleChange('localDoor', parseInt(e.target.value, 10))}
                className={`form-input ${errors.localDoor ? 'error' : ''}`}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map(id => (
                  <option key={id} value={id}>Дверь {id}</option>
                ))}
              </select>
              {errors.localDoor && <span className="error-message">{errors.localDoor}</span>}
            </div>
          </div>
          
          <div className="form-group">
            <label>
              Global Door ID (автоматически)
            </label>
            <input
              type="text"
              value={`ID-${formData.nodeId}-${formData.localDoor} (${globalDoorId})`}
              disabled
              className="form-input"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="type">
              Тип двери <span className="required">*</span>
            </label>
            <select
              id="type"
              value={formData.type}
              onChange={(e) => handleChange('type', e.target.value)}
              className={`form-input ${errors.type ? 'error' : ''}`}
            >
              <option value="NC">NC (Normally Closed)</option>
              <option value="NO">NO (Normally Open)</option>
              <option value="CARD_READER">CARD_READER (Считыватель карт)</option>
            </select>
            {errors.type && <span className="error-message">{errors.type}</span>}
          </div>
          
          <div className="form-group">
            <label htmlFor="comment">Комментарий</label>
            <input
              id="comment"
              type="text"
              value={formData.comment}
              onChange={(e) => handleChange('comment', e.target.value)}
              maxLength={32}
              placeholder="Описание двери (опционально)"
              className={`form-input ${errors.comment ? 'error' : ''}`}
            />
            {errors.comment && <span className="error-message">{errors.comment}</span>}
            <small>Максимум 32 символа</small>
          </div>
        </div>
        
        <div className="modal-footer">
          <Button onClick={onCancel} variant="secondary">
            Отмена
          </Button>
          <Button onClick={handleSave} variant="primary">
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DoorEditModal;
