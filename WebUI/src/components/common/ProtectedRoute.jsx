/**
 * ProtectedRoute — проверка сессии (токен в localStorage для API). Отдельных «профилей» в UI нет.
 */

import { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children - Компонент для отображения
 * @param {string} [props.path] - Зарезервировано (доступ не ограничивается по пути)
 * @param {string[]} [props.allowedRoles] - Если задано, проверяется user.role из контекста
 */
const ProtectedRoute = ({ children, path: _path, allowedRoles = [] }) => {
  const { t } = useLanguage();
  const { user, isAuthenticated, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
      }}>
        <div>{t('common.loading')}</div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/monitoring/doors" replace />;
  }

  let hasAccess = true;
  if (allowedRoles.length > 0) {
    hasAccess = allowedRoles.includes(user.role);
  }

  if (!hasAccess) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        fontFamily: 'Arial',
      }}
      >
        <h1 style={{ color: '#d32f2f', marginBottom: '20px' }}>{t('errors.accessDenied')}</h1>
        <p style={{ color: '#666', marginBottom: '30px' }}>
          Страница недоступна в текущей конфигурации интерфейса.
        </p>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
