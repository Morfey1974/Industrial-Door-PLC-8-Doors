/**
 * DoorEditModal - модальное окно редактирования двери
 */

import { useState, useEffect } from 'react';
import Button from '../../../components/common/Button';
import { useLanguage } from '../../../context/LanguageContext';
import { calculateGlobalDoorId } from '../../../utils/configValidator';

const DoorEditModal = ({ door, existingDoors, onSave, onCancel }) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    techId: '',
    drawingId: '',
    nodeId: 1,
    localDoor: 1,
    type: 'NO',
    comment: '',
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (door) {
      setFormData({
        techId: door.techId || '',
        drawingId: door.drawingId || '',
        nodeId: door.nodeId || 1,
        localDoor: door.localDoor || 1,
        type: door.type || 'NO',
        comment: door.comment || '',
      });
    }
  }, [door]);

  const globalDoorId = calculateGlobalDoorId(formData.nodeId, formData.localDoor);

  const validate = () => {
    const newErrors = {};

    const editingDoorTechId =
      door && door.techId !== undefined && door.techId !== null ? parseInt(door.techId, 10) : null;

    if (!formData.techId || intPos(formData.techId) < 1) {
      newErrors.techId = t('pages.config.validation.formTechIdPositive');
    } else {
      const techIdNum = parseInt(formData.techId, 10);
      const duplicate = existingDoors.find((d) => {
        const dTechId = parseInt(d.techId, 10);
        return dTechId === techIdNum && dTechId !== editingDoorTechId;
      });
      if (duplicate) {
        newErrors.techId = t('pages.config.validation.formTechIdDuplicate', { techId: formData.techId });
      }
    }

    if (!formData.nodeId || formData.nodeId < 1 || formData.nodeId > 10) {
      newErrors.nodeId = t('pages.config.validation.formNodeIdRange');
    }

    if (!formData.localDoor || formData.localDoor < 1 || formData.localDoor > 8) {
      newErrors.localDoor = t('pages.config.validation.formLocalDoorRange');
    }

    if (formData.nodeId && formData.localDoor) {
      const duplicate = existingDoors.find((d) => {
        const dNodeId = parseInt(d.nodeId, 10);
        const dLocalDoor = parseInt(d.localDoor, 10);
        const dTechId = parseInt(d.techId, 10);
        return (
          dNodeId === intPos(formData.nodeId) &&
          dLocalDoor === intPos(formData.localDoor) &&
          dTechId !== editingDoorTechId
        );
      });
      if (duplicate) {
        newErrors.nodeId = t('pages.config.validation.formPairDuplicate', {
          nodeId: formData.nodeId,
          localDoor: formData.localDoor,
        });
      }
    }

    if (!formData.type || !['NC', 'NO'].includes(formData.type)) {
      newErrors.type = t('pages.config.validation.formTypeInvalid');
    }

    if (formData.comment && formData.comment.length > 100) {
      newErrors.comment = t('pages.config.validation.formCommentTooLong');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  function intPos(v) {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? 0 : n;
  }

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

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
      typeCode: formData.type === 'NO' ? 1 : 0,
      comment: (formData.comment || '').slice(0, 32),
    };

    onSave(doorData);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content door-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{door.techId ? t('pages.doorEdit.edit') : t('pages.doorEdit.add')}</h3>
          <button type="button" className="modal-close" onClick={onCancel}>✕</button>
        </div>

        <div className="modal-body door-edit-modal-body">
          <div className="door-edit-grid door-edit-grid--row1">
            <div className="form-group">
              <label htmlFor="techId">
                {t('pages.doorEdit.seqLabel')} <span className="required">*</span>
              </label>
              <input
                id="techId"
                type="number"
                value={formData.techId}
                onChange={(e) => handleChange('techId', e.target.value)}
                min={1}
                className={`form-input form-input--compact ${errors.techId ? 'error' : ''}`}
              />
              {errors.techId && <span className="error-message">{errors.techId}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="drawingId">{t('pages.doorEdit.drawingIdLabel')}</label>
              <input
                id="drawingId"
                type="number"
                value={formData.drawingId}
                onChange={(e) => handleChange('drawingId', e.target.value)}
                min={0}
                className="form-input form-input--compact"
              />
              <small>{t('pages.doorEdit.drawingIdHint')}</small>
            </div>
          </div>

          <div className="door-edit-grid door-edit-grid--row2">
            <div className="form-group">
              <label htmlFor="nodeId">
                {t('pages.doorEdit.boardLabel')} <span className="required">*</span>
              </label>
              <select
                id="nodeId"
                value={formData.nodeId}
                onChange={(e) => handleChange('nodeId', parseInt(e.target.value, 10))}
                className={`form-input form-input--compact ${errors.nodeId ? 'error' : ''}`}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
              {errors.nodeId && <span className="error-message">{errors.nodeId}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="localDoor">
                {t('pages.doorEdit.doorSlotLabel')} <span className="required">*</span>
              </label>
              <select
                id="localDoor"
                value={formData.localDoor}
                onChange={(e) => handleChange('localDoor', parseInt(e.target.value, 10))}
                className={`form-input form-input--compact ${errors.localDoor ? 'error' : ''}`}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
              {errors.localDoor && <span className="error-message">{errors.localDoor}</span>}
            </div>
            <div className="form-group">
              <label>{t('pages.doorEdit.doorIdLabel')}</label>
              <input
                type="text"
                value={`ID-${formData.nodeId}-${formData.localDoor} (${globalDoorId})`}
                disabled
                className="form-input form-input--compact form-input--readonly"
              />
            </div>
          </div>

          <div className="door-edit-grid door-edit-grid--row3">
            <div className="form-group">
              <label htmlFor="type">
                {t('pages.doorEdit.typeLabel')} <span className="required">*</span>
              </label>
              <select
                id="type"
                value={formData.type}
                onChange={(e) => handleChange('type', e.target.value)}
                className={`form-input form-input--compact ${errors.type ? 'error' : ''}`}
              >
                <option value="NC">{t('pages.doorEdit.typeNC')}</option>
                <option value="NO">{t('pages.doorEdit.typeNO')}</option>
              </select>
              {errors.type && <span className="error-message">{errors.type}</span>}
            </div>
          </div>

          <div className="form-group form-group--full">
            <label htmlFor="comment">{t('pages.doorEdit.commentLabel')}</label>
            <input
              id="comment"
              type="text"
              value={formData.comment}
              onChange={(e) => handleChange('comment', e.target.value)}
              maxLength={100}
              placeholder={t('pages.doorEdit.commentPlaceholder')}
              className={`form-input form-input--full ${errors.comment ? 'error' : ''}`}
            />
            <small>{t('pages.doorEdit.commentMax')}</small>
            {errors.comment && <span className="error-message">{errors.comment}</span>}
          </div>
        </div>

        <div className="modal-footer door-edit-modal-footer">
          <Button onClick={onCancel} variant="secondary">
            {t('pages.doorEdit.cancel')}
          </Button>
          <Button onClick={handleSave} variant="primary">
            {t('pages.doorEdit.save')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DoorEditModal;
