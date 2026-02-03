/**
 * ForgotPasswordModal - модальное окно для запроса восстановления пароля
 * 
 * Для Super Admin: позволяет сгенерировать токен восстановления для любого пользователя
 * Для обычных пользователей: показывает инструкцию обратиться к администратору
 */

import { useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { requestPasswordReset } from '../../services/auth';
import './ForgotPasswordModal.css';

const ForgotPasswordModal = ({ isOpen, onClose }) => {
  const { user } = useContext(AuthContext);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [resetToken, setResetToken] = useState(null);

  const isSuperAdmin = user?.role === 'super_admin';

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setResetToken(null);

    if (!username.trim()) {
      setError('Введите имя пользователя');
      return;
    }

    if (!isSuperAdmin) {
      setError('Только Super Admin может генерировать токены восстановления');
      return;
    }

    setLoading(true);
    try {
      const data = await requestPasswordReset(username.trim());

      if (data.ok) {
        setSuccess('Токен восстановления успешно сгенерирован');
        setResetToken(data.token);
      } else {
        setError(data.error || 'Ошибка генерации токена');
      }
    } catch (err) {
      setError('Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setUsername('');
    setError(null);
    setSuccess(null);
    setResetToken(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="forgot-password-modal">
        <h2>Восстановление пароля</h2>
        
        {!isSuperAdmin ? (
          <div className="forgot-password-info">
            <p>Для восстановления пароля обратитесь к администратору системы.</p>
            <p>Только Super Admin может сгенерировать токен восстановления пароля.</p>
            <Button onClick={handleClose} variant="primary" style={{ marginTop: '20px' }}>
              Закрыть
            </Button>
          </div>
        ) : (
          <form onSubmit={handleRequestReset} className="forgot-password-form">
            {error && (
              <div className="error-message" style={{
                padding: '10px',
                marginBottom: '15px',
                backgroundColor: '#ffebee',
                border: '1px solid #f44336',
                borderRadius: '4px',
                color: '#c62828'
              }}>
                {error}
              </div>
            )}

            {success && !resetToken && (
              <div className="success-message" style={{
                padding: '10px',
                marginBottom: '15px',
                backgroundColor: '#e8f5e9',
                border: '1px solid #4caf50',
                borderRadius: '4px',
                color: '#2e7d32'
              }}>
                {success}
              </div>
            )}

            {resetToken && (
              <div className="reset-token-display" style={{
                padding: '15px',
                marginBottom: '15px',
                backgroundColor: '#e3f2fd',
                border: '2px solid #2196f3',
                borderRadius: '4px'
              }}>
                <p style={{ marginBottom: '10px', fontWeight: '600' }}>
                  Токен восстановления пароля сгенерирован:
                </p>
                <div style={{
                  padding: '10px',
                  backgroundColor: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  wordBreak: 'break-all',
                  marginBottom: '10px'
                }}>
                  {resetToken}
                </div>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
                  ⚠️ Токен действителен в течение 15 минут.
                </p>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
                  Передайте пользователю следующую ссылку для сброса пароля:
                </p>
                <div style={{
                  padding: '10px',
                  backgroundColor: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '12px',
                  wordBreak: 'break-all',
                  marginBottom: '10px'
                }}>
                  {window.location.origin}/reset-password?token={resetToken}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/reset-password?token=${resetToken}`);
                    alert('Ссылка скопирована в буфер обмена');
                  }}
                  style={{ width: '100%', marginTop: '10px' }}
                >
                  Копировать ссылку
                </Button>
              </div>
            )}

            <div className="form-group">
              <label>Имя пользователя:</label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Введите имя пользователя"
                required
                disabled={loading || !!resetToken}
              />
            </div>

            <div className="form-actions">
              <Button
                type="submit"
                variant="primary"
                disabled={loading || !!resetToken}
                style={{ marginRight: '10px' }}
              >
                {loading ? 'Генерация...' : 'Сгенерировать токен'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleClose}
                disabled={loading}
              >
                Закрыть
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};

export default ForgotPasswordModal;
