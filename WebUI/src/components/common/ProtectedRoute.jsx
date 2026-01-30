/**
 * ProtectedRoute - защита маршрутов по таблице прав (path) или по ролям (allowedRoles)
 */

import { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { PermissionsContext } from '../../context/PermissionsContext';

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children - Компонент для отображения
 * @param {string} [props.path] - Путь маршрута; при наличии доступ проверяется по таблице прав
 * @param {string[]} [props.allowedRoles] - Массив разрешённых ролей (если path не передан)
 */
const ProtectedRoute = ({ children, path, allowedRoles = [] }) => {
  const { user, isAuthenticated, loading } = useContext(AuthContext);
  const permissionsContext = useContext(PermissionsContext);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
      }}>
        <div>Загрузка...</div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  let hasAccess = true;
  if (path && permissionsContext?.canAccess) {
    hasAccess = permissionsContext.canAccess(path, user.role);
  } else if (allowedRoles.length > 0) {
    hasAccess = allowedRoles.includes(user.role);
  }

  if (!hasAccess) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        fontFamily: 'Arial',
      }}>
        <h1 style={{ color: '#d32f2f', marginBottom: '20px' }}>Доступ запрещён</h1>
        <p style={{ color: '#666', marginBottom: '30px' }}>
          У вас нет прав доступа к этой странице.
        </p>
        <p style={{ color: '#999', fontSize: '14px' }}>
          Ваша роль: <strong>
            {user.role === 'super_admin' ? 'Супер-администратор' :
              user.role === 'admin' ? 'Администратор' :
                user.role === 'operator' ? 'Оператор' : user.role}
          </strong>
        </p>
        {allowedRoles.length > 0 && (
          <p style={{ color: '#999', fontSize: '14px', marginTop: '10px' }}>
            Требуемые роли: {allowedRoles.map(r =>
              r === 'super_admin' ? 'Супер-администратор' :
                r === 'admin' ? 'Администратор' :
                  r === 'operator' ? 'Оператор' : r
            ).join(', ')}
          </p>
        )}
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
