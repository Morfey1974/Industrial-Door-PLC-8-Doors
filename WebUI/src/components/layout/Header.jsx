/**
 * Header компонент - верхний хедер приложения
 * Статусы Сеть, Link, IP и сообщение об ошибке связи — в шапке на всех страницах
 */

import { useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { useStateData } from '../../context/StateDataContext';
import { useLeaveConfirm } from '../../context/LeaveConfirmContext';
import { useLanguage } from '../../context/LanguageContext';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import Button from '../common/Button';
import { formatIpAddress } from '../../utils/formatters';

let logoImage;
try {
  logoImage = new URL('../../assets/logo/Logo.png', import.meta.url).href;
} catch (error) {
  console.warn('Не удалось загрузить логотип:', error);
  logoImage = null;
}

const Header = () => {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const { tryNavigate } = useLeaveConfirm();
  const { t, language, setLanguage } = useLanguage();
  const { data: state, loading: stateLoading, error: stateError, refetch: refetchState } = useStateData();
  const [browserOffline, setBrowserOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const goHome = () => (tryNavigate || navigate)('/');

  const refetchRef = useRef(refetchState);
  refetchRef.current = refetchState;

  useEffect(() => {
    /* Браузерные online/offline события позволяют быстрее подсветить шапку,
     * не дожидаясь таймаута API запроса /state.
     */
    const onOnline = () => {
      setBrowserOffline(false);
      refetchRef.current(true, true);
    };
    const onOffline = () => {
      setBrowserOffline(true);
      refetchRef.current(true, true);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useAutoRefresh(() => refetchState(true), 2000);

  const handleRetry = () => {
    /* В момент "Нет связи" часто висит предыдущий запрос /state (таймаут/ожидание).
     * Обычный refetch в этом случае может быть проигнорирован защитой от параллельных запросов.
     * Force-режим принудительно прерывает текущий запрос и запускает новый.
     */
    setBrowserOffline(false);
    refetchState(false, true);
  };

  const handleLogout = async () => {
    await logout();
  };

  const offline = browserOffline || !!stateError;
  const netReady = offline ? false : (state?.netReady ?? false);
  const linkUp = offline ? false : (state?.linkUp ?? false);

  return (
    <header className="header">
      <div className="header-left">
        <Link
          to="/"
          className="logo-link"
          style={{ textDecoration: 'none', color: 'inherit' }}
          onClick={(e) => {
            e.preventDefault();
            goHome();
          }}
        >
          <div className="logo">
            {logoImage && (
              <img src={logoImage} alt="DCM Logo" className="logo-image" onError={(e) => {
                console.error('Ошибка загрузки изображения логотипа');
                e.target.style.display = 'none';
              }} />
            )}
            <div className="logo-text-container">
              <span className="logo-text">DCM</span>
              <span className="logo-subtitle">DOORS CONTROL MAKING</span>
            </div>
          </div>
        </Link>
      </div>
      <div className="header-right">
        {/* Переключатель языка — слева от статуса сети */}
        <div className="header-lang-switcher" role="group" aria-label="Язык / Language">
          <button
            type="button"
            className={`header-lang-btn ${language === 'ru' ? 'active' : ''}`}
            onClick={() => setLanguage('ru')}
            title="Русский"
          >
            RU
          </button>
          <button
            type="button"
            className={`header-lang-btn ${language === 'en' ? 'active' : ''}`}
            onClick={() => setLanguage('en')}
            title="English"
          >
            EN
          </button>
        </div>
        {/* Статусы и ошибка связи — видны на всех страницах */}
        {!stateLoading && (state || stateError) && (
          <div className="header-status">
            <div className="header-status-indicators">
              <div className="header-status-item" title={netReady ? t('header.networkReady') : t('header.networkNotReady')}>
                <span
                  className="header-status-dot"
                  style={{
                    backgroundColor: netReady ? '#28a745' : '#dc3545',
                    borderColor: netReady ? '#1e7e34' : '#c82333',
                    boxShadow: netReady ? '0 0 6px rgba(40, 167, 69, 0.5)' : 'none'
                  }}
                />
                <span className="header-status-label">{t('header.network')}</span>
              </div>
              <div className="header-status-item" title={linkUp ? t('header.linkUp') : t('header.linkDown')}>
                <span
                  className="header-status-dot"
                  style={{
                    backgroundColor: linkUp ? '#28a745' : '#dc3545',
                    borderColor: linkUp ? '#1e7e34' : '#c82333',
                    boxShadow: linkUp ? '0 0 6px rgba(40, 167, 69, 0.5)' : 'none'
                  }}
                />
                <span className="header-status-label">{t('header.link')}</span>
              </div>
            </div>
            <div className="header-status-values">
              <span className="header-status-ip" title={t('header.ipAddress')}>
                {offline ? '—' : (state?.ip ? formatIpAddress(state.ip) : '—')}
              </span>
            </div>
            {stateError && (
              <div className="header-status-error">
                <span className="header-status-error-text" title={stateError}>
                  {t('header.noConnection')}
                </span>
                <Button variant="secondary" size="small" onClick={handleRetry}>
                  {t('common.retry')}
                </Button>
              </div>
            )}
          </div>
        )}
        <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span className="user-name" style={{ fontSize: '14px' }}>
            {user ? user.username : t('common.user')}
            {user && user.role === 'super_admin' && (
              <span style={{ marginLeft: '8px', fontSize: '12px', opacity: 0.8 }}>(Super Admin)</span>
            )}
          </span>
          <Button
            variant="secondary"
            size="small"
            onClick={handleLogout}
            style={{ padding: '5px 15px', fontSize: '12px' }}
          >
            {t('header.logout')}
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
