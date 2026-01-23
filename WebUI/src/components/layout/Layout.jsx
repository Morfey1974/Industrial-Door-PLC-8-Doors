/**
 * Layout компонент - общий layout приложения
 */

const Layout = ({ children }) => {
  return (
    <div className="layout">
      {children}
    </div>
  );
};

export default Layout;
