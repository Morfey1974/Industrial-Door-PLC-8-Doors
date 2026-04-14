/**
 * Header компонент - верхний хедер приложения
 * Статусы Сеть, Link, IP и сообщение об ошибке связи — в шапке на всех страницах
 */

import { useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useStateData } from '../../context/StateDataContext';
import { useLeaveConfirm } from '../../context/LeaveConfirmContext';
import { useLanguage } from '../../context/LanguageContext';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import Button from '../common/Button';
import { formatIpAddress } from '../../utils/formatters';
import {
  STATE_HEADER_STALE_MS,
  HEADER_STATE_POLL_MS,
  getControllerUrlForDisplay,
  MONITOR_PATHS_WITH_DOORS,
  MONITOR_DATA_STALE_MS,
} from '../../utils/constants';

let logoImage;
try {
  logoImage = new URL('../../assets/logo/Logo.png', import.meta.url).href;
} catch (error) {
  console.warn('Не удалось загрузить логотип:', error);
  logoImage = null;
}

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tryNavigate } = useLeaveConfirm();
  const { t } = useLanguage();
  const {
    data: state,
    loading: stateLoading,
    error: stateError,
    refetch: refetchState,
    lastSuccessAt,
    backgroundBusy,
  } = useStateData();
  const [browserOffline, setBrowserOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [, setStaleClock] = useState(0);
  const goHome = () => (tryNavigate || navigate)('/monitoring/doors');

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

  /* Через STATE_HEADER_STALE_MS без успешного /api/state — пересчитать «протухло» без действий пользователя. */
  useEffect(() => {
    if (lastSuccessAt == null) return undefined;
    const id = setInterval(() => setStaleClock((c) => c + 1), 1000);
    return () => clearInterval(id);
  }, [lastSuccessAt]);

  useAutoRefresh(() => refetchState(true), HEADER_STATE_POLL_MS);

  const handleRetry = () => {
    /* В момент "Нет связи" часто висит предыдущий запрос /state (таймаут/ожидание).
     * Обычный refetch в этом случае может быть проигнорирован защитой от параллельных запросов.
     * Force-режим принудительно прерывает текущий запрос и запускает новый.
     */
    setBrowserOffline(false);
    refetchState(false, true);
  };

  const apiStateStale =
    lastSuccessAt != null && Date.now() - lastSuccessAt > STATE_HEADER_STALE_MS;
  /* На мониторинге с doors в запросе: если >12 с нет успешного ответа (ECONNRESET/abort и т.д.),
   * кэш ещё с netReady/linkUp, но таблица дверей уже «мертвая» — не показываем зелёный как «всё ок». */
  const monitorStale =
    MONITOR_PATHS_WITH_DOORS.includes(location.pathname) &&
    !stateLoading &&
    !backgroundBusy &&
    lastSuccessAt != null &&
    Date.now() - lastSuccessAt > MONITOR_DATA_STALE_MS;
  /* Офлайн для индикаторов: нет сети в браузере; или ошибка опроса (в т.ч. при кэшированном state — иначе
   * зелёные точки по последнему успешному netReady/linkUp вводят в заблуждение); или давно не было успешного /api/state. */
  const hardOffline = browserOffline || !!stateError || apiStateStale || monitorStale;
  const netReady = hardOffline ? false : (state?.netReady ?? false);
  const linkUp = hardOffline ? false : (state?.linkUp ?? false);
  /* Первый /state или зависший запрос: раньше блок скрывался (!stateLoading && …) — «индикаторов нет». */
  const statusPending = stateLoading && !state && !stateError;

  return (
    <header className="header">
      <div className="header-left">
        <Link
          to="/monitoring/doors"
          className="logo-link"
          style={{ textDecoration: 'none', color: 'inherit' }}
          onClick={(e) => {
            e.preventDefault();
            goHome();
          }}
        >
          <div className="logo">
            {logoImage && (
              <img src={logoImage} alt={t('header.logoAlt')} className="logo-image" onError={(e) => {
                console.error('Ошибка загрузки изображения логотипа');
                e.target.style.display = 'none';
              }} />
            )}
            <div className="logo-text-container">
              <span className="logo-text">DCM</span>
              <span className="logo-subtitle">{t('header.logoSubtitle')}</span>
            </div>
          </div>
        </Link>
      </div>
      <div className="header-right">
        {/* Статусы всегда в шапке: при загрузке /state — серые точки, не пустое место. */}
        <div className="header-status">
          <div className="header-status-indicators">
            <div
              className="header-status-item"
              title={
                statusPending
                  ? t('header.network')
                  : netReady
                    ? t('header.networkReady')
                    : t('header.networkNotReady')
              }
            >
              <span
                className="header-status-dot"
                style={{
                  backgroundColor: statusPending ? '#adb5bd' : netReady ? '#28a745' : '#dc3545',
                  borderColor: statusPending ? '#868e96' : netReady ? '#1e7e34' : '#c82333',
                  boxShadow: !statusPending && netReady ? '0 0 6px rgba(40, 167, 69, 0.5)' : 'none'
                }}
              />
              <span className="header-status-label">{t('header.network')}</span>
            </div>
            <div
              className="header-status-item"
              title={
                statusPending
                  ? t('header.link')
                  : linkUp
                    ? t('header.linkUp')
                    : t('header.linkDown')
              }
            >
              <span
                className="header-status-dot"
                style={{
                  backgroundColor: statusPending ? '#adb5bd' : linkUp ? '#28a745' : '#dc3545',
                  borderColor: statusPending ? '#868e96' : linkUp ? '#1e7e34' : '#c82333',
                  boxShadow: !statusPending && linkUp ? '0 0 6px rgba(40, 167, 69, 0.5)' : 'none'
                }}
              />
              <span className="header-status-label">{t('header.link')}</span>
            </div>
          </div>
          <div className="header-status-values">
            <span className="header-status-ip" title={t('header.ipAddress')}>
              {statusPending ? '…' : hardOffline ? '—' : (state?.ip ? formatIpAddress(state.ip) : '—')}
            </span>
          </div>
          {(!!stateError || apiStateStale || monitorStale) && (
            <div className="header-status-error">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', maxWidth: 'min(420px, 55vw)' }}>
                <span
                  className="header-status-error-text"
                  title={
                    apiStateStale || monitorStale
                      ? t('header.stateStaleHint')
                      : String(stateError || '')
                  }
                >
                  {t('header.noConnection')}
                </span>
                {/* Без кабеля Ethernet или при другой подсети браузер не достучится до МК — показываем целевой URL явно. */}
                <span
                  style={{ fontSize: '11px', lineHeight: 1.35, opacity: 0.92, wordBreak: 'break-all' }}
                  title={t('header.apiTargetTitle')}
                >
                  {t('header.apiTargetHint')}: <strong>{getControllerUrlForDisplay()}</strong>
                </span>
              </div>
              <Button variant="secondary" size="small" onClick={handleRetry}>
                {t('common.retry')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
