/**
 * AuthContext — сессия для API (токен в localStorage). Отдельной страницы входа нет.
 * После загрузки выставляется полный доступ (роль super_admin) без запроса к серверу.
 */

import { createContext, useState, useEffect } from 'react';

/** Минимальный объект сессии: роль для проверок в UI (например маппинг). */
const LAB_USER = Object.freeze({ role: 'super_admin' });

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    localStorage.setItem('auth_token', 'open');
    localStorage.setItem('auth_user', JSON.stringify(LAB_USER));
    setUser({ ...LAB_USER });
    setIsAuthenticated(true);
    setLoading(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
