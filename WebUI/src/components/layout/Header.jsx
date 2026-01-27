/**
 * Header компонент - верхний хедер приложения
 */

import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import Button from '../common/Button';

let logoImage;
try {
  logoImage = new URL('../../assets/logo/Logo.png', import.meta.url).href;
} catch (error) {
  console.warn('Не удалось загрузить логотип:', error);
  logoImage = null;
}

const Header = () => {
  const { user, logout } = useContext(AuthContext);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <header className="header">
      <div className="header-left">
        <Link to="/" className="logo-link" style={{ textDecoration: 'none', color: 'inherit' }}>
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
        </Link>
      </div>
      <div className="header-right">
        <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span className="user-name" style={{ fontSize: '14px' }}>
            {user ? user.username : 'Пользователь'}
            {user && user.role === 'super_admin' && (
              <span style={{ marginLeft: '8px', fontSize: '12px', opacity: 0.8 }}>(Super Admin)</span>
            )}
          </span>
          <Button 
            variant="secondary" 
            size="small"
            onClick={handleLogout}
            style={{ padding: '5px 15px', fontSize: '12px' }}
          >
            Выход
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
