import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import './Modal.css';

const Modal = ({
  isOpen,
  type = 'confirm',
  title = '',
  message = '',
  defaultValue = '',
  placeholder = '',
  confirmText = 'OK',
  cancelText = 'Отмена',
  singleButton = false, // один блок «Понятно» (информационное окно)
  onConfirm,
  onCancel,
  onClose, // Новый проп для закрытия модалки с произвольным содержимым
  children, // Поддержка произвольного содержимого
}) => {
  const [inputValue, setInputValue] = useState(defaultValue);
  const inputRef = useRef(null);

  // Если передан children или onClose, используем режим с произвольным содержимым
  // Это означает, что содержимое управляется извне (через children)
  const hasCustomContent = (children !== null && children !== undefined && children !== false && 
    (Array.isArray(children) ? children.length > 0 : true)) || !!onClose;

  // Сброс значения input при изменении defaultValue
  useEffect(() => {
    if (isOpen) {
      setInputValue(defaultValue);
      // Фокус на input при открытии prompt модального окна
      if (type === 'prompt' && inputRef.current) {
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 100);
      }
    }
  }, [isOpen, defaultValue, type]);

  // Обработка нажатия Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (hasCustomContent && onClose) {
          onClose();
        } else if (onCancel) {
          onCancel();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onCancel, onClose, hasCustomContent]);

  // Обработка клика по overlay (закрытие при клике вне модального окна)
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      if (hasCustomContent && onClose) {
        onClose();
      } else if (onCancel) {
        onCancel();
      }
    }
  };

  // Обработка подтверждения
  const handleConfirm = () => {
    if (type === 'prompt') {
      if (onConfirm) {
        onConfirm(inputValue);
      }
    } else {
      if (onConfirm) {
        onConfirm();
      }
    }
  };

  // Обработка нажатия Enter в input
  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="modal-header">
            <h3>{title}</h3>
          </div>
        )}
        <div className="modal-body">
          {hasCustomContent ? (
            // Произвольное содержимое (children)
            children
          ) : (
            // Стандартное содержимое (message или prompt)
            <>
              {message && (
                <div className="modal-message">
                  {typeof message === 'string' ? (
                    <p>{message}</p>
                  ) : (
                    message
                  )}
                </div>
              )}
              {type === 'prompt' && (
                <div className="modal-input-wrapper">
                  <input
                    ref={inputRef}
                    type="text"
                    className="modal-input"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder={placeholder}
                    autoFocus
                  />
                </div>
              )}
            </>
          )}
        </div>
        {!hasCustomContent && (
          <div className="modal-footer">
            {!singleButton && (
              <Button onClick={onCancel || (() => {})} variant="secondary">
                {cancelText}
              </Button>
            )}
            <Button onClick={handleConfirm} variant="primary">
              {confirmText}
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  // Используем createPortal для рендеринга модального окна в body
  return createPortal(modalContent, document.body);
};

export default Modal;
