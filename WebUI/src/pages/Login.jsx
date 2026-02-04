/**
 * Login страница - страница входа
 */

import { useState, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import Button from '../components/common/Button';
import PasswordInput from '../components/common/PasswordInput';
import SplashScreen from '../components/common/SplashScreen';
import ForgotPasswordModal from '../components/common/ForgotPasswordModal';
import '../styles/layout.css';

let logoImage;
try {
  logoImage = new URL('../assets/logo/Logo.png', import.meta.url).href;
} catch (error) {
  console.warn('Не удалось загрузить логотип:', error);
  logoImage = null;
}

const Login = () => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reasonConfigApplied = searchParams.get('reason') === 'config_applied';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await login(username, password);
      if (result.success) {
        navigate('/');
      } else {
        let msg = result.error || 'Ошибка входа';
        if (msg.includes('429')) {
          msg = 'Слишком много попыток входа. Подождите около 15 минут.';
        } else if (result.remainingAttempts !== undefined && result.remainingAttempts !== null) {
          msg += `. Осталось попыток до блокировки: ${result.remainingAttempts}`;
        }
        setError(msg);
      }
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      const isRateLimit = status === 429 || String(err.message || '').includes('429');
      if (isRateLimit) {
        setError('Слишком много попыток входа. Подождите около 15 минут.');
      } else if (status === 401) {
        let msg = 'Неверные учётные данные';
        if (data?.remainingAttempts !== undefined && data?.remainingAttempts !== null) {
          msg += `. Осталось попыток до блокировки: ${data.remainingAttempts}`;
        }
        setError(msg);
      } else {
        let msg = data?.error || err.message || 'Ошибка подключения к серверу';
        if (data?.remainingAttempts !== undefined && data?.remainingAttempts !== null) {
          msg += `. Осталось попыток до блокировки: ${data.remainingAttempts}`;
        }
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  return (
    <div className="login-page">
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
      <ForgotPasswordModal 
        isOpen={showForgotPasswordModal} 
        onClose={() => setShowForgotPasswordModal(false)} 
      />
      <div 
        className={`login-container ${showSplash ? 'login-container-hidden' : 'login-container-visible'}`}
        style={{ 
          pointerEvents: showSplash ? 'none' : 'auto'
        }}
      >
        <div className="login-header">
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
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          {reasonConfigApplied && (
            <div className="login-info-message" style={{
              padding: '10px',
              marginBottom: '15px',
              backgroundColor: '#e3f2fd',
              border: '1px solid #2196f3',
              borderRadius: '4px',
              color: '#1565c0',
            }}>
              Конфигурация успешно применена. Контроллер перезагрузился — войдите снова.
            </div>
          )}
          {typeof window !== 'undefined' && window.location?.protocol === 'http:' && (
            <div style={{
              padding: '8px 10px',
              marginBottom: '15px',
              backgroundColor: '#fff8e1',
              border: '1px solid #ffa000',
              borderRadius: '4px',
              color: '#e65100',
              fontSize: '13px',
            }}>
              Подключение по HTTP — трафик не шифруется. Для защиты данных рекомендуется использовать HTTPS.
            </div>
          )}
          {error && (
            <div className="error" style={{ 
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
          <div className="form-group">
            <label>Логин</label>
            <input
              type="text"
              className="form-control"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              disabled={loading}
            />
          </div>
          <PasswordInput
            id="login-password"
            label="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="admin"
            required
            disabled={loading}
            showForgotPassword={true}
            onForgotPassword={() => {
              setShowForgotPasswordModal(true);
            }}
          />
          <Button 
            type="submit" 
            variant="primary" 
            disabled={loading}
            style={{ width: '100%', marginTop: '10px' }}
          >
            {loading ? 'Вход...' : 'Вход'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Login;
