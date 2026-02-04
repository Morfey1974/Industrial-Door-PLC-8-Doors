/**
 * AuthContext - контекст для аутентификации
 */

import { createContext, useState, useEffect } from 'react';
import { login as apiLogin, logout as apiLogout, getSession } from '../services/auth';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Проверяем сессию при загрузке
  useEffect(() => {
    const checkSession = async () => {
      try {
        const session = await getSession();
        if (session.ok && session.user) {
          setUser(session.user);
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error('Ошибка проверки сессии:', error);
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, []);

  const login = async (username, password) => {
    try {
      const response = await apiLogin(username, password);
      if (response.ok) {
        const userData = {
          username: response.username || username,
          role: response.role || 'super_admin',
        };
        setUser(userData);
        setIsAuthenticated(true);
        
        // Сохраняем в localStorage для отладки
        localStorage.setItem('auth_token', response.token || 'debug_token');
        localStorage.setItem('auth_user', JSON.stringify(userData));
        
        return { success: true };
      } else {
        /* Единое русское сообщение (response.error может быть с сервера на английском) */
        return {
          success: false,
          error: 'Неверные учётные данные',
          remainingAttempts: response.remainingAttempts,
        };
      }
    } catch (error) {
      console.error('Ошибка входа:', error);
      const status = error.response?.status;
      const data = error.response?.data;
      if (status === 429 || String(error.message || '').includes('429')) {
        return { success: false, error: 'Слишком много попыток входа. Подождите около 15 минут.' };
      }
      /* Всегда показываем русское сообщение при 401 (не доверяем data.error — может быть старая прошивка или не JSON) */
      if (status === 401) {
        return {
          success: false,
          error: 'Неверные учётные данные',
          remainingAttempts: data?.remainingAttempts,
        };
      }
      return {
        success: false,
        error: data?.error || error.message || 'Ошибка подключения к серверу',
        remainingAttempts: data?.remainingAttempts,
      };
    }
  };

  const logout = async () => {
    try {
      await apiLogout();
    } catch (error) {
      console.error('Ошибка выхода:', error);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      const { changePassword: apiChangePassword } = await import('../services/auth');
      const response = await apiChangePassword(currentPassword, newPassword);
      if (response.ok) {
        return { success: true };
      } else {
        return { success: false, error: response.error || 'Ошибка изменения пароля' };
      }
    } catch (error) {
      console.error('Ошибка изменения пароля:', error);
      return { success: false, error: error.message || 'Ошибка подключения к серверу' };
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
};
