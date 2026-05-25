/**
 * ControllerConnectionModal — настройка подключения к контроллеру
 * Для удалённого тестирования с другого компьютера без пересборки
 */

import { useState, useEffect } from 'react';
import Modal from './Modal';
import Button from './Button';
import './ControllerConnectionModal.css';
import { getControllerUrlForDisplay, saveControllerUrl } from '../../utils/constants';

const ControllerConnectionModal = ({ isOpen, onClose }) => {
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setUrl(getControllerUrlForDisplay());
      setSaved(false);
    }
  }, [isOpen]);

  const handleSave = (e) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    let toSave = trimmed;
    if (!toSave.startsWith('http://') && !toSave.startsWith('https://')) {
      toSave = `http://${toSave}`;
    }
    saveControllerUrl(toSave);
    setSaved(true);
    setUrl(toSave);
  };

  const handleClose = () => {
    setSaved(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="controller-connection-modal">
        <h2>Подключение к контроллеру</h2>
        <p className="controller-connection-info">
          Укажите адрес контроллера для подключения с этого компьютера. Формат: <strong>http://IP:порт</strong> или <strong>IP:порт</strong>.
        </p>
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label htmlFor="controller-url">Адрес контроллера</label>
            <input
              id="controller-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.50"
              className="form-input controller-url-input"
            />
            <small>Например: 192.168.1.50 или http://192.168.1.50 (порт HTTP в прошивке зашит = 80, указывать не нужно)</small>
          </div>
          {saved && (
            <p className="controller-connection-saved" role="status">
              Адрес сохранён. Повторите вход.
            </p>
          )}
          <div className="controller-connection-actions">
            <Button type="submit" variant="primary">
              Сохранить
            </Button>
            <Button type="button" variant="secondary" onClick={handleClose}>
              Закрыть
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default ControllerConnectionModal;
