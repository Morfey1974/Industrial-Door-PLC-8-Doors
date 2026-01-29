import { useState, useEffect, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import Layout from './components/layout/Layout';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import Tabs from './components/layout/Tabs';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Doors from './pages/Monitoring/Doors';
import Events from './pages/Monitoring/Events';
import Alarms from './pages/Monitoring/Alarms';
import Statistics from './pages/Monitoring/Statistics';
import DoorsConfig from './pages/Configuration/DoorsConfig';
import NetworkConfig from './pages/Configuration/NetworkConfig';
import SystemParams from './pages/Configuration/SystemParams';
import Mapping from './pages/Mapping';
import Profile from './pages/Settings/Profile';
import Users from './pages/Settings/Users';
import Permissions from './pages/Settings/Permissions';
import ResetPassword from './pages/ResetPassword';
import ProtectedRoute from './components/common/ProtectedRoute';
import './styles/main.css';

// Компонент для управления навигацией
function AppContent() {
  try {
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Все хуки должны вызываться ДО любых условных возвратов
    // Это правило React Hooks - хуки должны вызываться в одном и том же порядке на каждом рендере
    const navigate = useNavigate();
    const location = useLocation();
    const { user, isAuthenticated, loading } = useContext(AuthContext);

    // Определяем активную вкладку на основе текущего пути
    const getActiveTab = () => {
      if (location.pathname.startsWith('/monitoring')) return 'monitoring';
      if (location.pathname.startsWith('/configuration')) return 'configuration';
      if (location.pathname.startsWith('/settings')) return 'settings';
      if (location.pathname === '/' || location.pathname === '/dashboard') return 'monitoring';
      return 'monitoring'; // По умолчанию
    };

    // Определяем активный элемент сайдбара на основе текущего пути
    const getActiveSidebarItem = () => {
      if (location.pathname === '/monitoring/doors' || location.pathname === '/') return 'doors';
      if (location.pathname === '/monitoring/events') return 'events';
      if (location.pathname === '/monitoring/alarms') return 'alarms';
      if (location.pathname === '/monitoring/statistics') return 'statistics';
      if (location.pathname === '/monitoring/mapping') return 'mapping';
      if (location.pathname === '/configuration/doors') return 'doors-config';
      if (location.pathname === '/configuration/network') return 'network-config';
      if (location.pathname === '/configuration/system') return 'system-params';
      if (location.pathname === '/configuration/mapping') return 'mapping-config';
      if (location.pathname === '/settings/profile') return 'profile';
      if (location.pathname === '/settings/permissions') return 'permissions';
      if (location.pathname === '/settings/users') return 'users';
      return 'doors';
    };

    // ВСЕ хуки вызываются ДО условных возвратов
    const [activeTab, setActiveTab] = useState(getActiveTab());
    const [activeSidebarItem, setActiveSidebarItem] = useState(getActiveSidebarItem());

    // Обновляем активные элементы при изменении маршрута
    useEffect(() => {
      setActiveTab(getActiveTab());
      setActiveSidebarItem(getActiveSidebarItem());
    }, [location.pathname]);

    // Страницы, доступные без авторизации
    const publicPaths = ['/reset-password'];
    const isPublicPath = publicPaths.some(path => location.pathname.startsWith(path));
    
    // Показываем загрузку при проверке аутентификации (только для защищенных страниц)
    if (loading && !isPublicPath) {
      return (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          flexDirection: 'column',
          gap: '20px'
        }}>
          <div>Загрузка...</div>
        </div>
      );
    }

    // Если не аутентифицирован и это не публичная страница, показываем страницу входа
    if (!isAuthenticated && !isPublicPath) {
      return <Login />;
    }
    
    // Если это публичная страница, рендерим её без Layout
    if (isPublicPath) {
      return (
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      );
    }

    // Вкладки - скрываем Конфигурацию для операторов
    const tabs = (() => {
      const role = user?.role;
      const result = [
        { id: 'monitoring', label: 'Мониторинг' },
      ];
      // Конфигурация только для admin и super_admin
      if (role !== 'operator') {
        result.push({ id: 'configuration', label: 'Конфигурация' });
      }
      result.push({ id: 'settings', label: 'Настройки' });
      return result;
    })();

    // Определяем доступные пункты меню в зависимости от роли
    const getSidebarItems = () => {
      const role = user?.role;
      
      // Мониторинг доступен всем ролям
      const monitoring = [
        { id: 'doors', label: 'Двери', path: '/monitoring/doors' },
        { id: 'events', label: 'События', path: '/monitoring/events' },
        { id: 'alarms', label: 'Алармы', path: '/monitoring/alarms' },
        { id: 'statistics', label: 'Статистика', path: '/monitoring/statistics' },
        { id: 'mapping', label: 'Маппинг', path: '/monitoring/mapping' },
      ];

      // Конфигурация доступна только администраторам и супер-администраторам
      const configuration = role === 'operator' ? [] : [
        { id: 'doors-config', label: 'Настройка дверей', path: '/configuration/doors' },
        { id: 'network-config', label: 'Сетевые настройки', path: '/configuration/network' },
        { id: 'system-params', label: 'Параметры системы', path: '/configuration/system' },
        { id: 'mapping-config', label: 'Маппинг', path: '/configuration/mapping' },
      ];

      // Настройки
      const settings = [
        { id: 'profile', label: 'Профиль', path: '/settings/profile' },
      ];
      
      // Пункт "Права доступа" для Admin и Super Admin
      if (role === 'admin' || role === 'super_admin') {
        settings.push({ id: 'permissions', label: 'Права доступа', path: '/settings/permissions' });
      }
      
      // Пункт "Пользователи" только для Super Admin
      if (role === 'super_admin') {
        settings.push({ id: 'users', label: 'Пользователи', path: '/settings/users' });
      }

      return { monitoring, configuration, settings };
    };

    const sidebarItems = getSidebarItems();

    const handleTabChange = (tabId) => {
      setActiveTab(tabId);
      // Переходим на первый элемент выбранной вкладки
      const items = sidebarItems[tabId];
      if (items && items.length > 0) {
        navigate(items[0].path);
      } else {
        // Если нет доступных элементов (например, оператор пытается открыть Конфигурацию),
        // перенаправляем на главную страницу
        navigate('/');
      }
    };

    const handleSidebarItemClick = (itemId) => {
      setActiveSidebarItem(itemId);
      // Находим путь для выбранного элемента
      const allItems = [...sidebarItems.monitoring, ...sidebarItems.configuration, ...sidebarItems.settings];
      const item = allItems.find(i => i.id === itemId);
      if (item) {
        navigate(item.path);
      }
    };

    return (
      <AppProvider>
        <Layout>
          <Header />
          <div className="layout-main">
            <Sidebar 
              items={sidebarItems[activeTab] || sidebarItems.monitoring} 
              activeItem={activeSidebarItem}
              onItemClick={handleSidebarItemClick}
            />
            <div className="layout-content">
              <div className="layout-content-inner">
                <Routes>
                {/* Мониторинг - доступен всем ролям */}
                <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/monitoring/doors" element={<ProtectedRoute><Doors /></ProtectedRoute>} />
                <Route path="/monitoring/events" element={<ProtectedRoute><Events /></ProtectedRoute>} />
                <Route path="/monitoring/alarms" element={<ProtectedRoute><Alarms /></ProtectedRoute>} />
                <Route path="/monitoring/statistics" element={<ProtectedRoute><Statistics /></ProtectedRoute>} />
                
                {/* Конфигурация - только для admin и super_admin */}
                <Route 
                  path="/configuration/doors" 
                  element={
                    <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
                      <DoorsConfig />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/configuration/network" 
                  element={
                    <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
                      <NetworkConfig />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/configuration/system" 
                  element={
                    <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
                      <SystemParams />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/configuration/mapping" 
                  element={
                    <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
                      <Mapping />
                    </ProtectedRoute>
                  } 
                />
                
                {/* Мониторинг - Маппинг доступен всем для просмотра */}
                <Route path="/monitoring/mapping" element={<ProtectedRoute><Mapping /></ProtectedRoute>} />
                
                {/* Настройки - профиль доступен всем, пользователи только super_admin, права доступа для admin и super_admin */}
                <Route path="/settings/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route 
                  path="/settings/users" 
                  element={
                    <ProtectedRoute allowedRoles={['super_admin']}>
                      <Users />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/settings/permissions" 
                  element={
                    <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
                      <Permissions />
                    </ProtectedRoute>
                  } 
                />
                
                </Routes>
              </div>
            </div>
          </div>
          <Tabs 
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        </Layout>
      </AppProvider>
    );
  } catch (error) {
    console.error('Ошибка в AppContent:', error);
    return (
      <div style={{ padding: '20px', fontFamily: 'Arial' }}>
        <h1>Ошибка рендеринга</h1>
        <p>{error.message}</p>
        <p>Проверьте консоль браузера (F12) для подробностей</p>
      </div>
    );
  }
}

function App() {
  try {
    return (
      <Router
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </Router>
    );
  } catch (error) {
    console.error('Ошибка в App:', error);
    return (
      <div style={{ padding: '20px', fontFamily: 'Arial' }}>
        <h1>Критическая ошибка приложения</h1>
        <p>{error.message}</p>
        <p>Проверьте консоль браузера (F12) для подробностей</p>
      </div>
    );
  }
}

export default App;
