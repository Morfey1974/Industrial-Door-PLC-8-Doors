/**
 * Profile страница - профиль пользователя
 * 
 * Реализует:
 * - Отображение информации о текущем пользователе
 * - Изменение пароля (для всех ролей)
 * - Отображение роли пользователя
 */

import { useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import Button from '../../components/common/Button';
import './Profile.css';

const Profile = () => {
  const { user, changePassword } = useContext(AuthContext);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  // Получаем название роли для отображения
  const getRoleName = (role) => {
    const roleNames = {
      'super_admin': 'Супер-администратор',
      'admin': 'Администратор',
      'operator': 'Оператор',
      'monitor': 'Мониторинг'
    };
    return roleNames[role] || role;
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Валидация
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Все поля обязательны для заполнения');
      return;
    }

    if (newPassword.length < 8) {
      setError('Новый пароль должен содержать минимум 8 символов');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Новый пароль и подтверждение не совпадают');
      return;
    }

    if (currentPassword === newPassword) {
      setError('Новый пароль должен отличаться от текущего');
      return;
    }

    setLoading(true);
    try {
      const result = await changePassword(currentPassword, newPassword);
      if (result.success) {
        setSuccess('Пароль успешно изменен');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setError(result.error || 'Ошибка изменения пароля');
      }
    } catch (err) {
      setError(err.message || 'Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-profile">
      <h1>Профиль пользователя</h1>

      {/* Информация о пользователе */}
      <section className="profile-section">
        <h2>Информация о пользователе</h2>
        <div className="profile-info">
          <div className="profile-info-item">
            <label>Имя пользователя:</label>
            <span>{user?.username || '—'}</span>
          </div>
          <div className="profile-info-item">
            <label>Роль:</label>
            <span>{user?.role ? getRoleName(user.role) : '—'}</span>
          </div>
        </div>
      </section>

      {/* Изменение пароля */}
      <section className="profile-section">
        <h2>Изменение пароля</h2>
        <form className="profile-form" onSubmit={handleChangePassword}>
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
          {success && (
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
          
          <div className="form-group">
            <label htmlFor="currentPassword">Текущий пароль</label>
            <input
              id="currentPassword"
              type="password"
              className="form-control"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Введите текущий пароль"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="newPassword">Новый пароль</label>
            <input
              id="newPassword"
              type="password"
              className="form-control"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Минимум 8 символов"
              required
              disabled={loading}
              minLength={8}
            />
            <small className="form-help">Минимальная длина: 8 символов</small>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Подтверждение пароля</label>
            <input
              id="confirmPassword"
              type="password"
              className="form-control"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Повторите новый пароль"
              required
              disabled={loading}
              minLength={8}
            />
          </div>

          <Button 
            type="submit" 
            variant="primary" 
            disabled={loading}
            style={{ marginTop: '10px' }}
          >
            {loading ? 'Изменение...' : 'Изменить пароль'}
          </Button>
        </form>
      </section>
    </div>
  );
};

export default Profile;
