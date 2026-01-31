/**
 * Login страница - страница входа
 */

import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import Button from '../components/common/Button';
import PasswordInput from '../components/common/PasswordInput';
import SplashScreen from '../components/common/SplashScreen';
import ForgotPasswordModal from '../components/common/ForgotPasswordModal';
import ControllerConnectionModal from '../components/common/ControllerConnectionModal';
import { getControllerUrlForDisplay } from '../utils/constants';
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
  const [showControllerModal, setShowControllerModal] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await login(username, password);
      if (result.success) {
        navigate('/');
      } else {
        setError(result.error || 'Ошибка входа');
      }
    } catch (err) {
      setError(err.message || 'Ошибка подключения к серверу');
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
      <ControllerConnectionModal 
        isOpen={showControllerModal} 
        onClose={() => setShowControllerModal(false)} 
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
          <div style={{ marginTop: '15px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
            Для отладки: admin / admin
          </div>
          <button
            type="button"
            className="login-controller-link"
            onClick={() => setShowControllerModal(true)}
          >
            Подключение к контроллеру ({getControllerUrlForDisplay()})
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
