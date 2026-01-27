/**
 * ProtectedRoute - компонент для защиты маршрутов на основе ролей пользователя
 */

import { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children - Компонент для отображения
 * @param {string[]} props.allowedRoles - Массив разрешенных ролей (например, ['super_admin', 'admin'])
 * @param {string} props.redirectTo - Путь для редиректа при отсутствии доступа (по умолчанию '/')
 */
const ProtectedRoute = ({ children, allowedRoles = [], redirectTo = '/' }) => {
  const { user, isAuthenticated, loading } = useContext(AuthContext);

  // Пока идет проверка аутентификации
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <div>Загрузка...</div>
      </div>
    );
  }

  // Если не аутентифицирован, перенаправляем на страницу входа
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Если указаны роли и роль пользователя не входит в список разрешенных
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return (
      <div style={{ 
        padding: '40px', 
        textAlign: 'center',
        fontFamily: 'Arial'
      }}>
        <h1 style={{ color: '#d32f2f', marginBottom: '20px' }}>Доступ запрещен</h1>
        <p style={{ color: '#666', marginBottom: '30px' }}>
          У вас нет прав доступа к этой странице.
        </p>
        <p style={{ color: '#999', fontSize: '14px' }}>
          Ваша роль: <strong>{user.role === 'super_admin' ? 'Супер-администратор' : 
                          user.role === 'admin' ? 'Администратор' : 
                          user.role === 'operator' ? 'Оператор' : user.role}</strong>
        </p>
        <p style={{ color: '#999', fontSize: '14px', marginTop: '10px' }}>
          Требуемые роли: {allowedRoles.map(r => 
            r === 'super_admin' ? 'Супер-администратор' : 
            r === 'admin' ? 'Администратор' : 
            r === 'operator' ? 'Оператор' : r
          ).join(', ')}
        </p>
      </div>
    );
  }

  // Доступ разрешен
  return children;
};

export default ProtectedRoute;
