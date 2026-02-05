/**
 * ResetPassword страница - сброс пароля по токену
 * 
 * Доступна без авторизации
 * Пользователь переходит на эту страницу с токеном в URL параметрах
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import Button from '../components/common/Button';
import PasswordInput from '../components/common/PasswordInput';
import { resetPassword } from '../services/auth';
import '../styles/layout.css';
import './ResetPassword.css';

let logoImage;
try {
  logoImage = new URL('../assets/logo/Logo.png', import.meta.url).href;
} catch (error) {
  console.warn('Не удалось загрузить логотип:', error);
  logoImage = null;
}

const ResetPassword = () => {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Токен восстановления не указан');
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!token) {
      setError('Токен восстановления не указан');
      return;
    }

    // Валидация
    if (!newPassword || !confirmPassword) {
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

    setLoading(true);
    try {
      const result = await resetPassword(token, newPassword);
      if (result.ok) {
        setSuccess('Пароль успешно изменен. Вы будете перенаправлены на страницу входа...');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        setError(result.error || 'Ошибка сброса пароля. Токен может быть недействительным или истекшим.');
      }
    } catch (err) {
      setError(err.message || 'Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="reset-password-page">
      <div className="reset-password-container">
        <div className="reset-password-header">
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
        
        <h1>{t('pages.resetPassword.title')}</h1>
        
        {!token ? (
          <div className="error" style={{ 
            padding: '15px', 
            marginBottom: '20px', 
            backgroundColor: '#ffebee', 
            border: '1px solid #f44336',
            borderRadius: '4px',
            color: '#c62828'
          }}>
            <p>Токен восстановления не указан или недействителен.</p>
            <p>Обратитесь к администратору для получения нового токена.</p>
          </div>
        ) : (
          <form className="reset-password-form" onSubmit={handleSubmit}>
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
            
            {success && (
              <div className="success" style={{ 
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
              <PasswordInput
                id="newPassword"
                label="Новый пароль"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Минимум 8 символов"
                required
                disabled={loading || !!success}
                minLength={8}
                showForgotPassword={false}
              />
              <small className="form-help" style={{ display: 'block', marginTop: '-10px', marginBottom: '15px', fontSize: '12px', color: '#666' }}>
                Минимальная длина: 8 символов
              </small>
            </div>

            <div className="form-group">
              <PasswordInput
                id="confirmPassword"
                label="Подтверждение пароля"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите новый пароль"
                required
                disabled={loading || !!success}
                minLength={8}
                showForgotPassword={false}
              />
            </div>

            <Button 
              type="submit" 
              variant="primary" 
              disabled={loading || !!success}
              style={{ width: '100%', marginTop: '10px' }}
            >
              {loading ? 'Сброс пароля...' : 'Сбросить пароль'}
            </Button>

            <Button 
              type="button" 
              variant="secondary" 
              onClick={() => navigate('/login')}
              style={{ width: '100%', marginTop: '10px' }}
            >
              Вернуться к входу
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
