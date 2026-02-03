/**
 * Profile страница - профиль пользователя
 *
 * Реализует:
 * - Отображение информации о текущем пользователе (имя, роль, email)
 * - Редактирование email (сохраняется в браузере по имени пользователя)
 * Изменение пароля — в разделе «Настройки → Пользователи».
 */

import { useContext, useState, useEffect } from 'react';
import { AuthContext } from '../../context/AuthContext';
import './Profile.css';

const PROFILE_EMAIL_KEY = 'profile_email';

const getStoredEmail = (username) => {
  if (!username) return '';
  try {
    const raw = localStorage.getItem(PROFILE_EMAIL_KEY);
    if (!raw) return '';
    const data = JSON.parse(raw);
    return data[username] ?? '';
  } catch {
    return '';
  }
};

const setStoredEmail = (username, email) => {
  if (!username) return;
  try {
    const raw = localStorage.getItem(PROFILE_EMAIL_KEY) || '{}';
    const data = JSON.parse(raw);
    data[username] = email || '';
    localStorage.setItem(PROFILE_EMAIL_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
};

const Profile = () => {
  const { user } = useContext(AuthContext);
  const [email, setEmail] = useState('');

  useEffect(() => {
    setEmail(getStoredEmail(user?.username));
  }, [user?.username]);

  const handleEmailChange = (e) => {
    const value = e.target.value.trim();
    setEmail(value);
    setStoredEmail(user?.username, value);
  };

  const getRoleName = (role) => {
    const roleNames = {
      'super_admin': 'Супер-администратор',
      'admin': 'Администратор',
      'operator': 'Оператор',
      'monitor': 'Мониторинг'
    };
    return roleNames[role] || role;
  };

  return (
    <div className="settings-profile">
      <h1>Профиль пользователя</h1>

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
          <div className="profile-info-item">
            <label htmlFor="profile-email">Email:</label>
            <input
              id="profile-email"
              type="email"
              className="form-control"
              value={email}
              onChange={handleEmailChange}
              placeholder="example@company.com"
              autoComplete="email"
              style={{ maxWidth: '320px' }}
            />
          </div>
        </div>
        <p className="profile-help" style={{ marginTop: '16px', color: '#666', fontSize: '14px' }}>
          Изменение пароля пользователей — в разделе <strong>Настройки → Пользователи</strong>.
        </p>
      </section>
    </div>
  );
};

export default Profile;
