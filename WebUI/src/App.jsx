import { useState, useEffect, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { PermissionsProvider, PermissionsContext } from './context/PermissionsContext';
import { useLanguage } from './context/LanguageContext';
import { AppProvider } from './context/AppContext';
import { StateDataProvider } from './context/StateDataContext';
import { LeaveConfirmProvider, useLeaveConfirm } from './context/LeaveConfirmContext';
import { DoorsDataProvider } from './context/DoorsDataContext';
import Layout from './components/layout/Layout';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import Tabs from './components/layout/Tabs';
import Login from './pages/Login';
import Doors from './pages/Monitoring/Doors';
import Events from './pages/Monitoring/Events';
import DoorsConfig from './pages/Configuration/DoorsConfig';
import Mapping from './pages/Mapping';
import Profile from './pages/Settings/Profile';
import Users from './pages/Settings/Users';
import Permissions from './pages/Settings/Permissions';
import SystemParams from './pages/Settings/SystemParams';
import About from './pages/Settings/About';
import Help from './pages/Settings/Help';
import { HelpSectionPage } from './pages/Settings/Help';
import ResetPassword from './pages/ResetPassword';
import ProtectedRoute from './components/common/ProtectedRoute';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './styles/main.css';

// Компонент для управления навигацией
function AppContent() {
  try {
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Все хуки должны вызываться ДО любых условных возвратов
    // Это правило React Hooks - хуки должны вызываться в одном и том же порядке на каждом рендере
    const navigate = useNavigate();
    const location = useLocation();
    const { user, isAuthenticated, loading } = useContext(AuthContext);
    const permissionsContext = useContext(PermissionsContext);
    const canAccessPath = permissionsContext?.canAccess ?? (() => true);
    const { tryNavigate } = useLeaveConfirm();
    const { t } = useLanguage();
    const doNavigate = tryNavigate || navigate;

    // Определяем активную вкладку на основе текущего пути
    const getActiveTab = () => {
      if (location.pathname.startsWith('/monitoring')) return 'monitoring';
      if (location.pathname.startsWith('/configuration')) return 'configuration';
      if (location.pathname.startsWith('/settings')) return 'settings';
      if (location.pathname === '/dashboard') return 'monitoring';
      return 'monitoring'; // По умолчанию
    };

    // Определяем активный элемент сайдбара на основе текущего пути
    const getActiveSidebarItem = () => {
      if (location.pathname === '/monitoring/doors' || location.pathname === '/') return 'doors';
      if (location.pathname === '/monitoring/events') return 'events';
      if (location.pathname === '/configuration/doors') return 'doors-config';
      if (location.pathname === '/configuration/mapping') return 'doors-config';
      if (location.pathname === '/settings/system') return 'system-params';
      if (location.pathname === '/settings/profile') return 'profile';
      if (location.pathname === '/settings/permissions') return 'permissions';
      if (location.pathname === '/settings/about') return 'about';
      if (location.pathname === '/settings/help' || location.pathname.startsWith('/settings/help/')) return 'help';
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
          <div>{t('common.loading')}</div>
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

    // Вкладки и пункты меню — по таблице прав (canAccessPath)
    const role = user?.role;
    const monitoringItems = [
      { id: 'doors', label: t('nav.doors'), path: '/monitoring/doors' },
      { id: 'events', label: t('nav.events'), path: '/monitoring/events' },
    ];
    const configurationItems = [
      { id: 'doors-config', label: t('nav.doorsConfig'), path: '/configuration/doors' },
    ];
    const monitoring = monitoringItems.filter((item) => canAccessPath(item.path, role));
    const configuration = configurationItems.filter((item) => canAccessPath(item.path, role));
    const settings = [];
    if (canAccessPath('/settings/profile', role)) {
      settings.push({ id: 'profile', label: t('nav.profile'), path: '/settings/profile' });
    }
    if (canAccessPath('/settings/system', role)) {
      settings.push({ id: 'system-params', label: t('nav.systemParams'), path: '/settings/system' });
    }
    if (canAccessPath('/settings/permissions', role)) {
      settings.push({ id: 'permissions', label: t('nav.permissions'), path: '/settings/permissions' });
    }
    if (canAccessPath('/settings/users', role)) {
      settings.push({ id: 'users', label: t('nav.users'), path: '/settings/users' });
    }
    if (canAccessPath('/settings/about', role)) {
      settings.push({ id: 'about', label: t('nav.about'), path: '/settings/about' });
    }
    if (canAccessPath('/settings/help', role)) {
      settings.push({ id: 'help', label: t('nav.help'), path: '/settings/help' });
    }

    const tabs = (() => {
      const result = [{ id: 'monitoring', label: t('nav.monitoring') }];
      if (configuration.length > 0) {
        result.push({ id: 'configuration', label: t('nav.configuration') });
      }
      result.push({ id: 'settings', label: t('nav.settings') });
      return result;
    })();

    const getSidebarItems = () => ({ monitoring, configuration, settings });

    const sidebarItems = getSidebarItems();

    const handleTabChange = (tabId) => {
      setActiveTab(tabId);
      // Переходим на первый элемент выбранной вкладки (через doNavigate — проверка несохранённых изменений в маппинге)
      const items = sidebarItems[tabId];
      if (items && items.length > 0) {
        doNavigate(items[0].path);
      } else {
        doNavigate('/monitoring/doors');
      }
    };

    const handleSidebarItemClick = (itemId) => {
      setActiveSidebarItem(itemId);
      const allItems = [...sidebarItems.monitoring, ...sidebarItems.configuration, ...sidebarItems.settings];
      const item = allItems.find(i => i.id === itemId);
      if (item) {
        doNavigate(item.path);
      }
    };

    return (
      <AppProvider>
        <StateDataProvider>
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
                <DoorsDataProvider>
                <ErrorBoundary>
                <Routes>
                {/* Доступ по таблице прав (path передаётся в ProtectedRoute) */}
                <Route path="/" element={<Navigate to="/monitoring/doors" replace />} />
                <Route path="/dashboard" element={<Navigate to="/monitoring/doors" replace />} />
                <Route path="/login" element={<Navigate to="/monitoring/doors" replace />} />
                <Route path="/monitoring/statistics" element={<Navigate to="/monitoring/doors" replace />} />
                <Route path="/monitoring/alarms" element={<Navigate to="/monitoring/doors" replace />} />
                <Route path="/monitoring/doors" element={<ProtectedRoute path="/monitoring/doors"><Doors /></ProtectedRoute>} />
                <Route path="/monitoring/events" element={<ProtectedRoute path="/monitoring/events"><Events /></ProtectedRoute>} />
                <Route path="/configuration/doors" element={<ProtectedRoute path="/configuration/doors"><DoorsConfig /></ProtectedRoute>} />
                <Route path="/configuration/mapping" element={<ProtectedRoute path="/configuration/mapping"><ErrorBoundary><Mapping /></ErrorBoundary></ProtectedRoute>} />
                <Route path="/settings/system" element={<ProtectedRoute path="/settings/system"><SystemParams /></ProtectedRoute>} />
                <Route path="/settings/profile" element={<ProtectedRoute path="/settings/profile"><Profile /></ProtectedRoute>} />
                <Route path="/settings/users" element={<ProtectedRoute path="/settings/users"><Users /></ProtectedRoute>} />
                <Route path="/settings/permissions" element={<ProtectedRoute path="/settings/permissions"><Permissions /></ProtectedRoute>} />
                <Route path="/settings/about" element={<ProtectedRoute path="/settings/about"><About /></ProtectedRoute>} />
                <Route path="/settings/help" element={<ProtectedRoute path="/settings/help"><Help /></ProtectedRoute>} />
                <Route path="/settings/help/:sectionId" element={<ProtectedRoute path="/settings/help"><HelpSectionPage /></ProtectedRoute>} />
                </Routes>
                </ErrorBoundary>
                </DoorsDataProvider>
              </div>
            </div>
          </div>
          <Tabs 
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        </Layout>
        </StateDataProvider>
      </AppProvider>
    );
  } catch (error) {
    console.error('Ошибка в AppContent:', error);
    return (
      <div style={{ padding: '20px', fontFamily: 'Arial' }}>
        <h1>{t('errors.renderError')}</h1>
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
          <PermissionsProvider>
            <LeaveConfirmProvider>
              <AppContent />
            </LeaveConfirmProvider>
          </PermissionsProvider>
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
