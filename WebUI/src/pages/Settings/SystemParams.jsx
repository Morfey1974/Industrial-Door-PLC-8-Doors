/**
 * SystemParams — объединённая страница «Параметры системы» во вкладке Настройки.
 * Структура с точки зрения промышленной безопасности и удалённого администрирования:
 * 1. Подключение к сети — доступ к контроллеру из LAN/WAN
 * 2. Безопасность и удалённый доступ — рекомендации по защите от несанкционированного доступа
 * 3. Время и идентификация — NTP, hostname для аудита
 * 4. Информация о контроллере — статус, диагностика
 */

import { useState, useEffect, useContext } from 'react';
import { getConfig, putConfig, getTime, setTime } from '../../services/api';
import { useStateData } from '../../context/StateDataContext';
import { useLanguage } from '../../context/LanguageContext';
import Button from '../../components/common/Button';
import './SystemParams.css';

const UI_TIMEZONE_STORAGE_KEY = 'ui_timezone';
const DEFAULT_TIMEZONE = 'Asia/Jerusalem';

const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const isValidIpv4 = (str) => {
  const m = ipv4Regex.exec(str);
  if (!m) return false;
  return m.slice(1, 5).every((oct) => {
    const n = parseInt(oct, 10);
    return n >= 0 && n <= 255;
  });
};

const DEFAULT_IP = '192.168.1.50';
const DEFAULT_NETMASK = '255.255.255.0';
const DEFAULT_GATEWAY = '192.168.1.1';

const SystemParams = () => {
  const { t, language } = useLanguage();
  const dateLocale = language === 'en' ? 'en-US' : 'ru-RU';

  /** Человекочитаемый uptime с локализованными единицами (д, ч, мин, с). */
  const formatUptime = (seconds) => {
    if (seconds == null) return t('pages.profile.dash');
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0) parts.push(`${d} ${t('pages.systemParams.uptimeDay')}`);
    if (h > 0) parts.push(`${h} ${t('pages.systemParams.uptimeHour')}`);
    if (m > 0) parts.push(`${m} ${t('pages.systemParams.uptimeMin')}`);
    if (s > 0 || parts.length === 0) parts.push(`${s} ${t('pages.systemParams.uptimeSec')}`);
    return parts.join(' ');
  };
  const stateData = useStateData();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [form, setForm] = useState({
    dhcpEnabled: true,
    ip: DEFAULT_IP,
    netmask: DEFAULT_NETMASK,
    gateway: DEFAULT_GATEWAY,
    webPort: 8080,
    dnsPrimary: '',
    dnsSecondary: '',
    ntpServer: 'pool.ntp.org',
    hostname: 'doors-controller',
    timezone: DEFAULT_TIMEZONE,
  });

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = await getConfig();
      const net = cfg?.net || {};
      const fmt = (arr) => (Array.isArray(arr) && arr.length === 4
        ? `${arr[0]}.${arr[1]}.${arr[2]}.${arr[3]}`
        : null);
      const ipVal = net.ip ?? fmt(net.ip);
      const netmaskVal = net.netmask ?? fmt(net.netmask);
      const gwVal = net.gateway ?? net.gw ?? fmt(net.gw);
      setForm({
        dhcpEnabled: net.dhcpEnabled !== 0,
        ip: (typeof ipVal === 'string' && ipVal) ? ipVal : DEFAULT_IP,
        netmask: (typeof netmaskVal === 'string' && netmaskVal) ? netmaskVal : DEFAULT_NETMASK,
        gateway: (typeof gwVal === 'string' && gwVal) ? gwVal : DEFAULT_GATEWAY,
        webPort: net.webPort ?? 8080,
        dnsPrimary: net.dnsPrimary ?? '',
        dnsSecondary: net.dnsSecondary ?? '',
        ntpServer: net.ntpServer ?? 'pool.ntp.org',
        hostname: net.hostname ?? 'doors-controller',
        timezone: net.timezone ?? localStorage.getItem(UI_TIMEZONE_STORAGE_KEY) ?? DEFAULT_TIMEZONE,
      });
    } catch (err) {
      setError(err?.message || t('pages.systemParams.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    /* Сохраняем выбранный часовой пояс локально, чтобы форматирование времени
     * на страницах мониторинга использовало единое значение для всего UI. */
    if (form.timezone) {
      localStorage.setItem(UI_TIMEZONE_STORAGE_KEY, form.timezone);
    }
  }, [form.timezone]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess(null);
    setError(null);
  };

  const validateStaticIp = () => {
    if (form.dhcpEnabled) return null;
    if (!isValidIpv4(form.ip)) return t('pages.systemParams.errIp');
    if (!isValidIpv4(form.netmask)) return t('pages.systemParams.errNetmask');
    if (!form.gateway.trim()) return null;
    if (!isValidIpv4(form.gateway)) return t('pages.systemParams.errGateway');
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErr = validateStaticIp();
    if (validationErr) {
      setError(validationErr);
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const webPort = Math.min(65535, Math.max(1, parseInt(String(form.webPort), 10) || 8080));
      const net = {
        dhcpEnabled: form.dhcpEnabled ? 1 : 0,
        webPort,
      };
      if (!form.dhcpEnabled) {
        if (isValidIpv4(form.ip)) net.ip = form.ip.trim();
        if (isValidIpv4(form.netmask)) net.netmask = form.netmask.trim();
        if (form.gateway.trim() && isValidIpv4(form.gateway)) net.gateway = form.gateway.trim();
      }
      await putConfig({ net });
      setSuccess(t('pages.systemParams.saveSuccess'));
    } catch (err) {
      setError(err?.message || t('pages.systemParams.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const state = stateData?.data;
  const ip = state?.ip ?? '—';
  const uptimeSeconds = state?.uptimeSeconds;
  const nodeId = state?.nodeId ?? '—';

  /* Время контроллера (RTC): отображение и синхронизация с ПК */
  const [controllerTime, setControllerTime] = useState(null); /* { unix, source } или null */
  const [timeLoading, setTimeLoading] = useState(false);
  const [timeSyncLoading, setTimeSyncLoading] = useState(false);
  const [timeError, setTimeError] = useState(null);

  const fetchControllerTime = async () => {
    setTimeLoading(true);
    setTimeError(null);
    try {
      const data = await getTime();
      setControllerTime(data?.ok ? { unix: data.unix, source: data.source } : null);
    } catch (err) {
      setTimeError(err?.message || t('pages.systemParams.timeFetchError'));
      setControllerTime(null);
    } finally {
      setTimeLoading(false);
    }
  };

  useEffect(() => {
    fetchControllerTime();
    const interval = setInterval(fetchControllerTime, 60000); /* обновление раз в минуту */
    return () => clearInterval(interval);
  }, []);

  const handleSyncTimeWithPc = async () => {
    setTimeSyncLoading(true);
    setTimeError(null);
    try {
      const unix = Math.floor(Date.now() / 1000);
      await setTime(unix);
      await fetchControllerTime();
    } catch (err) {
      setTimeError(err?.message || t('pages.systemParams.timeSetError'));
    } finally {
      setTimeSyncLoading(false);
    }
  };

  const formatControllerTime = (unix) => {
    if (unix == null || unix === 0) return t('pages.profile.dash');
    try {
      return new Date(unix * 1000).toLocaleString(dateLocale, {
        timeZone: form.timezone || DEFAULT_TIMEZONE,
        dateStyle: 'short',
        timeStyle: 'medium',
      });
    } catch {
      return t('pages.profile.dash');
    }
  };

  return (
    <div className="settings-system-params">
      <h1>{t('pages.systemParams.title')}</h1>
      <p className="system-params-page-intro">
        {t('pages.systemParams.pageIntro')}
      </p>

      {typeof window !== 'undefined' && window.location?.protocol === 'http:' && (
        <div className="system-params-message" style={{ backgroundColor: '#fff8e1', border: '1px solid #ffa000', color: '#e65100' }} role="status">
          {t('pages.systemParams.httpWarning')}
        </div>
      )}

      {error && (
        <div className="system-params-message system-params-error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="system-params-message system-params-success" role="status">
          {success}
        </div>
      )}

      {/* 1. Подключение к сети — доступ к контроллеру */}
      <section className="system-params-section">
        <h2>1. {t('pages.systemParams.section1')}</h2>
        <p className="system-params-intro">
          {t('pages.systemParams.networkIntro')}
        </p>
        <form onSubmit={handleSubmit} className="system-params-form">
          <div className="form-group">
            <label className="form-checkbox-label">
              <input
                type="checkbox"
                checked={form.dhcpEnabled}
                onChange={(e) => handleChange('dhcpEnabled', e.target.checked)}
                disabled={loading}
                className="form-checkbox"
              />
              <span>{t('pages.systemParams.dhcpLabel')}</span>
            </label>
            <small>
              {t('pages.systemParams.dhcpHint')}
            </small>
          </div>

          {!form.dhcpEnabled && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="ip">{t('pages.systemParams.ipLabel')}</label>
                  <input
                    id="ip"
                    type="text"
                    value={form.ip}
                    onChange={(e) => handleChange('ip', e.target.value)}
                    placeholder="192.168.1.50"
                    disabled={loading}
                    className={`form-input ${!form.dhcpEnabled && form.ip && !isValidIpv4(form.ip) ? 'form-input-error' : ''}`}
                  />
                  <small>{t('pages.systemParams.ipHint')}</small>
                </div>
                <div className="form-group">
                  <label htmlFor="netmask">{t('pages.systemParams.netmaskLabel')}</label>
                  <input
                    id="netmask"
                    type="text"
                    value={form.netmask}
                    onChange={(e) => handleChange('netmask', e.target.value)}
                    placeholder="255.255.255.0"
                    disabled={loading}
                    className={`form-input ${!form.dhcpEnabled && form.netmask && !isValidIpv4(form.netmask) ? 'form-input-error' : ''}`}
                  />
                  <small>{t('pages.systemParams.netmaskHint')}</small>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="gateway">{t('pages.systemParams.gatewayLabel')}</label>
                <input
                  id="gateway"
                  type="text"
                  value={form.gateway}
                  onChange={(e) => handleChange('gateway', e.target.value)}
                  placeholder="192.168.1.1"
                  disabled={loading}
                  className={`form-input form-input-narrow ${!form.dhcpEnabled && form.gateway && !isValidIpv4(form.gateway) ? 'form-input-error' : ''}`}
                />
                <small>{t('pages.systemParams.gatewayHint')}</small>
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="dnsPrimary">{t('pages.systemParams.dns1Label')}</label>
            <input
              id="dnsPrimary"
              type="text"
              value={form.dnsPrimary}
              onChange={(e) => handleChange('dnsPrimary', e.target.value)}
              placeholder={t('pages.systemParams.dns1Placeholder')}
              disabled={loading}
              className="form-input form-input-narrow"
            />
            <small>{t('pages.systemParams.dns1Hint')}</small>
          </div>

          <div className="form-group">
            <label htmlFor="dnsSecondary">{t('pages.systemParams.dns2Label')}</label>
            <input
              id="dnsSecondary"
              type="text"
              value={form.dnsSecondary}
              onChange={(e) => handleChange('dnsSecondary', e.target.value)}
              placeholder={t('pages.systemParams.dns2Placeholder')}
              disabled={loading}
              className="form-input form-input-narrow"
            />
            <small>{t('pages.systemParams.dns2Hint')}</small>
          </div>

          <div className="form-group">
            <label htmlFor="webPort">{t('pages.systemParams.webPortLabel')}</label>
            <input
              id="webPort"
              type="number"
              value={form.webPort}
              onChange={(e) => handleChange('webPort', e.target.value)}
              min={1}
              max={65535}
              step={1}
              disabled={loading}
              className="form-input form-input-narrow"
            />
            <small>{t('pages.systemParams.webPortHint', { port: String(form.webPort) })}</small>
          </div>

          <div className="system-params-actions">
            <Button type="submit" disabled={loading || saving}>
              {saving ? t('pages.systemParams.saving') : t('pages.systemParams.save')}
            </Button>
          </div>
        </form>
      </section>

      {/* 2. Безопасность и удалённый доступ */}
      <section className="system-params-section system-params-section-security">
        <h2>2. {t('pages.systemParams.section2')}</h2>
        <p className="system-params-intro">
          {t('pages.systemParams.securityIntro')}
        </p>
        <div className="system-params-security-checklist">
          <h3>{t('pages.systemParams.section2h3')}</h3>
          <ul>
            <li>{t('pages.systemParams.secVpn')}</li>
            <li>{t('pages.systemParams.secLan')}</li>
            <li>{t('pages.systemParams.secAccounts')}</li>
            <li>{t('pages.systemParams.secRoles')}</li>
            <li>{t('pages.systemParams.secHttps')}</li>
            <li>{t('pages.systemParams.secFirewall')}</li>
          </ul>
        </div>
        <div className="system-params-security-warning">
          <strong>{t('pages.systemParams.secLimitsLead')}</strong> {t('pages.systemParams.secLimitsBody')}
        </div>
      </section>

      {/* 3. Настройка VPN для доступа из другого города */}
      <section className="system-params-section system-params-section-vpn">
        <h2>3. {t('pages.systemParams.section3')}</h2>
        <p className="system-params-intro">
          {t('pages.systemParams.vpnIntro')}
        </p>
        <div className="system-params-vpn-options">
          <h3>{t('pages.systemParams.section3options')}</h3>
          <ul>
            <li>{t('pages.systemParams.vpnRouter')}</li>
            <li>{t('pages.systemParams.vpnPc')}</li>
            <li>{t('pages.systemParams.vpnTailscale')}</li>
          </ul>
        </div>
        <div className="system-params-vpn-after">
          <h3>{t('pages.systemParams.section3after')}</h3>
          <ol>
            <li>{t('pages.systemParams.vpnAfter1')}</li>
            <li>{t('pages.systemParams.vpnAfter2')}</li>
            <li>{t('pages.systemParams.vpnAfter3')}</li>
          </ol>
        </div>
        <p className="system-params-note">
          {t('pages.systemParams.vpnDocNote')}
        </p>
      </section>

      {/* 4. Время и идентификация */}
      <section className="system-params-section">
        <h2>4. {t('pages.systemParams.section4')}</h2>
        <p className="system-params-intro">
          {t('pages.systemParams.timeIntro')}
        </p>
        <div className="system-params-form">
          <div className="form-group">
            <label htmlFor="ntpServer">{t('pages.systemParams.ntpLabel')}</label>
            <input
              id="ntpServer"
              type="text"
              value={form.ntpServer}
              onChange={(e) => handleChange('ntpServer', e.target.value)}
              placeholder={t('pages.systemParams.ntpPlaceholder')}
              disabled={loading}
              className="form-input"
            />
            <small>{t('pages.systemParams.ntpHint')}</small>
          </div>
          <div className="form-group">
            <label htmlFor="hostname">{t('pages.systemParams.hostnameLabel')}</label>
            <input
              id="hostname"
              type="text"
              value={form.hostname}
              onChange={(e) => handleChange('hostname', e.target.value)}
              placeholder="doors-controller"
              disabled={loading}
              className="form-input form-input-narrow"
            />
            <small>{t('pages.systemParams.hostnameHint')}</small>
          </div>
          <div className="form-group">
            <label htmlFor="timezone">{t('pages.systemParams.timezoneLabel')}</label>
            <select
              id="timezone"
              value={form.timezone}
              onChange={(e) => handleChange('timezone', e.target.value)}
              disabled={loading}
              className="form-input form-input-narrow"
            >
              <option value="Asia/Jerusalem">{t('pages.systemParams.tzJerusalem')}</option>
              <option value="Europe/Moscow">{t('pages.systemParams.tzMoscow')}</option>
              <option value="Europe/Samara">{t('pages.systemParams.tzSamara')}</option>
              <option value="Asia/Yekaterinburg">{t('pages.systemParams.tzYekaterinburg')}</option>
              <option value="Asia/Novosibirsk">{t('pages.systemParams.tzNovosibirsk')}</option>
              <option value="Asia/Vladivostok">{t('pages.systemParams.tzVladivostok')}</option>
              <option value="UTC">{t('pages.systemParams.tzUtc')}</option>
            </select>
            <small>{t('pages.systemParams.timezoneHint')}</small>
          </div>
          <p className="system-params-note">
            {t('pages.systemParams.timeNote')}
          </p>
        </div>
      </section>

      {/* 5. Информация о контроллере */}
      <section className="system-params-section">
        <h2>5. {t('pages.systemParams.section5')}</h2>
        <div className="system-params-info-grid">
          <div className="system-params-info-item">
            <span className="system-params-info-label">{t('pages.systemParams.infoIp')}</span>
            <span className="system-params-info-value">{ip}</span>
          </div>
          <div className="system-params-info-item">
            <span className="system-params-info-label">{t('pages.systemParams.infoNodeId')}</span>
            <span className="system-params-info-value">{nodeId}</span>
          </div>
          <div className="system-params-info-item">
            <span className="system-params-info-label">{t('pages.systemParams.infoUptime')}</span>
            <span className="system-params-info-value">{formatUptime(uptimeSeconds)}</span>
          </div>
          <div className="system-params-info-item">
            <span className="system-params-info-label">{t('pages.systemParams.infoNet')}</span>
            <span className="system-params-info-value">
              {stateData?.loading ? t('pages.systemParams.ellipsis') : (state?.netReady ? t('pages.systemParams.netReady') : t('pages.systemParams.netNotReady'))}
            </span>
          </div>
          <div className="system-params-info-item">
            <span className="system-params-info-label">{t('pages.systemParams.infoRtc')}</span>
            <span className="system-params-info-value">
              {timeLoading ? t('pages.systemParams.ellipsis') : (controllerTime?.unix ? formatControllerTime(controllerTime.unix) : (timeError || t('pages.systemParams.timeUnavailable')))}
            </span>
          </div>
        </div>
        {timeError && (
          <p className="system-params-note" style={{ color: 'var(--color-error, #c00)' }}>{timeError}</p>
        )}
        <div className="system-params-rtc-actions" style={{ marginTop: '0.5rem' }}>
          <Button
            type="button"
            variant="secondary"
            onClick={fetchControllerTime}
            disabled={timeLoading}
          >
            {t('pages.systemParams.refresh')}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSyncTimeWithPc}
            disabled={timeSyncLoading || timeLoading}
          >
            {timeSyncLoading ? t('pages.systemParams.syncing') : t('pages.systemParams.syncPc')}
          </Button>
        </div>
      </section>
    </div>
  );
};

export default SystemParams;
