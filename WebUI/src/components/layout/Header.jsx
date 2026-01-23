/**
 * Header компонент - верхний хедер приложения
 */

let logoImage;
try {
  logoImage = new URL('../../assets/logo/Logo.png', import.meta.url).href;
} catch (error) {
  console.warn('Не удалось загрузить логотип:', error);
  logoImage = null;
}

const Header = () => {
  return (
    <header className="header">
      <div className="header-left">
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
      <div className="header-right">
        <div className="user-profile">
          <span className="user-name">Пользователь</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
