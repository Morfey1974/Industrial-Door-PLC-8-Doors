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

const formatUptime = (seconds) => {
  if (seconds == null) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d} д`);
  if (h > 0) parts.push(`${h} ч`);
  if (m > 0) parts.push(`${m} мин`);
  if (s > 0 || parts.length === 0) parts.push(`${s} с`);
  return parts.join(' ');
};

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
  const { t } = useLanguage();
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
    timezone: 'Europe/Moscow',
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
        timezone: net.timezone ?? 'Europe/Moscow',
      });
    } catch (err) {
      setError(err?.message || 'Не удалось загрузить настройки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess(null);
    setError(null);
  };

  const validateStaticIp = () => {
    if (form.dhcpEnabled) return null;
    if (!isValidIpv4(form.ip)) return 'Неверный формат IP-адреса';
    if (!isValidIpv4(form.netmask)) return 'Неверный формат маски подсети';
    if (!form.gateway.trim()) return null;
    if (!isValidIpv4(form.gateway)) return 'Неверный формат шлюза';
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
      setSuccess('Настройки сохранены. Контроллер может перезагрузиться.');
    } catch (err) {
      setError(err?.message || 'Не удалось сохранить настройки');
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
      setTimeError(err?.message || 'Не удалось получить время');
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
      setTimeError(err?.message || 'Не удалось установить время');
    } finally {
      setTimeSyncLoading(false);
    }
  };

  const formatControllerTime = (unix) => {
    if (unix == null || unix === 0) return '—';
    try {
      return new Date(unix * 1000).toLocaleString('ru-RU', {
        dateStyle: 'short',
        timeStyle: 'medium',
      });
    } catch {
      return '—';
    }
  };

  return (
    <div className="settings-system-params">
      <h1>{t('pages.systemParams.title')}</h1>
      <p className="system-params-page-intro">
        Полный удалённый доступ к контроллеру имеет только Супер-администратор. Настройки для подключения и обеспечения безопасного удалённого доступа.
      </p>

      {typeof window !== 'undefined' && window.location?.protocol === 'http:' && (
        <div className="system-params-message" style={{ backgroundColor: '#fff8e1', border: '1px solid #ffa000', color: '#e65100' }} role="status">
          Подключение по HTTP — трафик не шифруется. Для защиты данных рекомендуется использовать HTTPS.
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
          Параметры для доступа к контроллеру с любого устройства (ПК, планшет, смартфон). Укажите IP, маску, шлюз, порт — выданные IT-отделом или настраиваемые для LAN.
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
              <span>Включить DHCP (автоматическое получение IP)</span>
            </label>
            <small>
              При включённом DHCP контроллер получит IP, маску и шлюз от сервера DHCP в сети.
              При выключенном DHCP укажите статический IP вручную.
            </small>
          </div>

          {!form.dhcpEnabled && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="ip">IP-адрес</label>
                  <input
                    id="ip"
                    type="text"
                    value={form.ip}
                    onChange={(e) => handleChange('ip', e.target.value)}
                    placeholder="192.168.1.50"
                    disabled={loading}
                    className={`form-input ${!form.dhcpEnabled && form.ip && !isValidIpv4(form.ip) ? 'form-input-error' : ''}`}
                  />
                  <small>Например: 192.168.1.50. Должен быть уникальным в сети.</small>
                </div>
                <div className="form-group">
                  <label htmlFor="netmask">Маска подсети</label>
                  <input
                    id="netmask"
                    type="text"
                    value={form.netmask}
                    onChange={(e) => handleChange('netmask', e.target.value)}
                    placeholder="255.255.255.0"
                    disabled={loading}
                    className={`form-input ${!form.dhcpEnabled && form.netmask && !isValidIpv4(form.netmask) ? 'form-input-error' : ''}`}
                  />
                  <small>Обычно: 255.255.255.0 (/24)</small>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="gateway">Шлюз по умолчанию</label>
                <input
                  id="gateway"
                  type="text"
                  value={form.gateway}
                  onChange={(e) => handleChange('gateway', e.target.value)}
                  placeholder="192.168.1.1"
                  disabled={loading}
                  className={`form-input form-input-narrow ${!form.dhcpEnabled && form.gateway && !isValidIpv4(form.gateway) ? 'form-input-error' : ''}`}
                />
                <small>IP маршрутизатора или шлюза в вашей сети. Нужен для доступа в другие подсети и интернет.</small>
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="dnsPrimary">DNS-сервер 1</label>
            <input
              id="dnsPrimary"
              type="text"
              value={form.dnsPrimary}
              onChange={(e) => handleChange('dnsPrimary', e.target.value)}
              placeholder="192.168.1.1 или 8.8.8.8"
              disabled={loading}
              className="form-input form-input-narrow"
            />
            <small>Для разрешения имён хостов (NTP, обновления). Часто совпадает со шлюзом.</small>
          </div>

          <div className="form-group">
            <label htmlFor="dnsSecondary">DNS-сервер 2</label>
            <input
              id="dnsSecondary"
              type="text"
              value={form.dnsSecondary}
              onChange={(e) => handleChange('dnsSecondary', e.target.value)}
              placeholder="8.8.4.4 (опционально)"
              disabled={loading}
              className="form-input form-input-narrow"
            />
            <small>Резервный DNS. Может быть пустым.</small>
          </div>

          <div className="form-group">
            <label htmlFor="webPort">Порт веб-интерфейса</label>
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
            <small>Порт для доступа к веб-интерфейсу (1–65535). По умолчанию 8080. Для удалённого доступа: http://IP_контроллера:{form.webPort}</small>
          </div>

          <div className="system-params-actions">
            <Button type="submit" disabled={loading || saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </section>

      {/* 2. Безопасность и удалённый доступ */}
      <section className="system-params-section system-params-section-security">
        <h2>2. {t('pages.systemParams.section2')}</h2>
        <p className="system-params-intro">
          Рекомендации по защите контроллера от несанкционированного доступа при удалённой работе администратора.
        </p>
        <div className="system-params-security-checklist">
          <h3>{t('pages.systemParams.section2h3')}</h3>
          <ul>
            <li><strong>VPN:</strong> при доступе через интернет или из другой подсети используйте VPN предприятия. Контроллер не должен быть доступен напрямую из интернета.</li>
            <li><strong>Локальная сеть:</strong> предпочтительно подключаться из той же подсети, что и контроллер (LAN).</li>
            <li><strong>Учётные записи:</strong> используйте надёжные пароли (минимум 8 символов). Регулярно меняйте пароли администраторов.</li>
            <li><strong>Роли:</strong> выдавайте минимально необходимые права. Операторам — только просмотр, администраторам — конфигурация и параметры системы.</li>
            <li><strong>HTTPS:</strong> при появлении поддержки в прошивке — включайте HTTPS для шифрования трафика.</li>
            <li><strong>Firewall:</strong> на маршрутизаторе/шлюзе ограничьте доступ к контроллеру только с доверенных IP или VPN.</li>
          </ul>
        </div>
        <div className="system-params-security-warning">
          <strong>Ограничения текущей версии:</strong> соединение по HTTP (без шифрования). Для удалённого доступа через интернет обязательно используйте VPN.
        </div>
      </section>

      {/* 3. Настройка VPN для доступа из другого города */}
      <section className="system-params-section system-params-section-vpn">
        <h2>3. {t('pages.systemParams.section3')}</h2>
        <p className="system-params-intro">
          VPN настраивается на <strong>роутере</strong> или на <strong>ПК в сети</strong>, не на контроллере. После подключения к VPN вы оказываетесь в локальной сети и можете открыть WebUI по адресу 192.168.1.x.
        </p>
        <div className="system-params-vpn-options">
          <h3>{t('pages.systemParams.section3options')}</h3>
          <ul>
            <li><strong>VPN на роутере:</strong> если роутер поддерживает WireGuard или OpenVPN — включите VPN-сервер в веб-интерфейсе роутера, создайте пользователя/ключ. С телефона или ноутбука из другого города подключайтесь к этому VPN — затем откройте <code>http://IP_ПК:3000</code> и в «Подключение к контроллеру» укажите <code>http://IP_контроллера:порт</code>.</li>
            <li><strong>VPN на ПК:</strong> на компьютере, где запущен WebUI, установите VPN-сервер (WireGuard, OpenVPN). На роутере настройте переадресацию порта VPN на этот ПК. С удалённого устройства подключайтесь к VPN по внешнему IP или динамическому DNS.</li>
            <li><strong>Tailscale / ZeroTier:</strong> установите на ПК в сети и на устройство, с которого подключаетесь. Сервис создаёт зашифрованный туннель без настройки роутера. После подключения используйте тот же IP ПК (например 100.x.x.x в Tailscale), порт 3000.</li>
          </ul>
        </div>
        <div className="system-params-vpn-after">
          <h3>{t('pages.systemParams.section3after')}</h3>
          <ol>
            <li>Откройте в браузере <code>http://IP_ПК_с_WebUI:3000</code> (IP — из локальной сети или из VPN, например Tailscale выдаёт свой IP).</li>
            <li>Нажмите «Подключение к контроллеру» и укажите адрес контроллера (<code>http://192.168.1.50:80</code>).</li>
            <li>Войдите (admin / admin или свои учётные данные).</li>
          </ol>
        </div>
        <p className="system-params-note">
          Подробная пошаговая инструкция — в документации <strong>REMOTE_TESTING.md</strong>, раздел «Доступ из другого города (VPN)».
        </p>
      </section>

      {/* 4. Время и идентификация */}
      <section className="system-params-section">
        <h2>4. {t('pages.systemParams.section4')}</h2>
        <p className="system-params-intro">
          Корректное время нужно для журнала событий. Hostname помогает идентифицировать устройство в сети.
        </p>
        <div className="system-params-form">
          <div className="form-group">
            <label htmlFor="ntpServer">NTP-сервер</label>
            <input
              id="ntpServer"
              type="text"
              value={form.ntpServer}
              onChange={(e) => handleChange('ntpServer', e.target.value)}
              placeholder="pool.ntp.org или ntp.company.local"
              disabled={loading}
              className="form-input"
            />
            <small>Сервер синхронизации времени. На предприятиях часто используется внутренний NTP (например ntp.company.local).</small>
          </div>
          <div className="form-group">
            <label htmlFor="hostname">Имя устройства (Hostname)</label>
            <input
              id="hostname"
              type="text"
              value={form.hostname}
              onChange={(e) => handleChange('hostname', e.target.value)}
              placeholder="doors-controller"
              disabled={loading}
              className="form-input form-input-narrow"
            />
            <small>Имя для идентификации в сети (например: doors-controller-floor1). Используется в DNS и при поиске устройств.</small>
          </div>
          <div className="form-group">
            <label htmlFor="timezone">Часовой пояс</label>
            <select
              id="timezone"
              value={form.timezone}
              onChange={(e) => handleChange('timezone', e.target.value)}
              disabled={loading}
              className="form-input form-input-narrow"
            >
              <option value="Europe/Moscow">Москва (Europe/Moscow)</option>
              <option value="Europe/Samara">Самара (Europe/Samara)</option>
              <option value="Asia/Yekaterinburg">Екатеринбург (Asia/Yekaterinburg)</option>
              <option value="Asia/Novosibirsk">Новосибирск (Asia/Novosibirsk)</option>
              <option value="Asia/Vladivostok">Владивосток (Asia/Vladivostok)</option>
              <option value="UTC">UTC</option>
            </select>
            <small>Для корректного отображения времени в журнале событий.</small>
          </div>
          <p className="system-params-note">
            NTP, Hostname и часовой пояс будут сохранены при появлении поддержки в прошивке контроллера.
          </p>
        </div>
      </section>

      {/* 5. Информация о контроллере */}
      <section className="system-params-section">
        <h2>5. {t('pages.systemParams.section5')}</h2>
        <div className="system-params-info-grid">
          <div className="system-params-info-item">
            <span className="system-params-info-label">Текущий IP-адрес</span>
            <span className="system-params-info-value">{ip}</span>
          </div>
          <div className="system-params-info-item">
            <span className="system-params-info-label">Node ID</span>
            <span className="system-params-info-value">{nodeId}</span>
          </div>
          <div className="system-params-info-item">
            <span className="system-params-info-label">Время работы</span>
            <span className="system-params-info-value">{formatUptime(uptimeSeconds)}</span>
          </div>
          <div className="system-params-info-item">
            <span className="system-params-info-label">Состояние сети</span>
            <span className="system-params-info-value">
              {stateData?.loading ? '…' : (state?.netReady ? 'Готово' : 'Не готово')}
            </span>
          </div>
          <div className="system-params-info-item">
            <span className="system-params-info-label">Время контроллера (RTC)</span>
            <span className="system-params-info-value">
              {timeLoading ? '…' : (controllerTime?.unix ? formatControllerTime(controllerTime.unix) : (timeError || 'Недоступно'))}
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
            Обновить
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSyncTimeWithPc}
            disabled={timeSyncLoading || timeLoading}
          >
            {timeSyncLoading ? 'Синхронизация…' : 'Синхронизировать с ПК'}
          </Button>
        </div>
      </section>
    </div>
  );
};

export default SystemParams;
