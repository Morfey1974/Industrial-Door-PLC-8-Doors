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
import { useLanguage } from '../../context/LanguageContext';
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
  const { t } = useLanguage();
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

  /** Локализованные подписи ролей (совпадают с Users и журналом). */
  const getRoleName = (role) => {
    const map = {
      super_admin: 'pages.profile.roleSuperAdmin',
      admin: 'pages.profile.roleAdmin',
      operator: 'pages.profile.roleOperator',
      monitor: 'pages.profile.roleMonitor',
    };
    const key = map[role];
    return key ? t(key) : role;
  };

  return (
    <div className="settings-profile">
      <h1>{t('pages.profile.title')}</h1>

      <section className="profile-section">
        <h2>{t('pages.profile.userInfo')}</h2>
        <div className="profile-info">
          <div className="profile-info-item">
            <label>{t('pages.profile.labelUsername')}</label>
            <span>{user?.username || t('pages.profile.dash')}</span>
          </div>
          <div className="profile-info-item">
            <label>{t('pages.profile.labelRole')}</label>
            <span>{user?.role ? getRoleName(user.role) : t('pages.profile.dash')}</span>
          </div>
          <div className="profile-info-item">
            <label htmlFor="profile-email">{t('pages.profile.emailLabel')}</label>
            <input
              id="profile-email"
              type="email"
              className="form-control"
              value={email}
              onChange={handleEmailChange}
              placeholder={t('pages.profile.emailPlaceholder')}
              autoComplete="email"
              style={{ maxWidth: '320px' }}
            />
          </div>
        </div>
        <p className="profile-help" style={{ marginTop: '16px', color: '#666', fontSize: '14px' }}>
          {t('pages.profile.passwordHelp')}
        </p>
      </section>
    </div>
  );
};

export default Profile;
