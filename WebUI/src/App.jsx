import { useState, useEffect, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { useLanguage } from './context/LanguageContext';
import { AppProvider } from './context/AppContext';
import { StateDataProvider } from './context/StateDataContext';
import { LeaveConfirmProvider, useLeaveConfirm } from './context/LeaveConfirmContext';
import { DoorsDataProvider } from './context/DoorsDataContext';
import Layout from './components/layout/Layout';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import SplashScreen from './components/common/SplashScreen';
import Doors from './pages/Monitoring/Doors';
import DoorsConfig from './pages/Configuration/DoorsConfig';
import Mapping from './pages/Mapping';
import FlashSettings from './pages/Settings/FlashSettings';
import ProtectedRoute from './components/common/ProtectedRoute';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './styles/main.css';

/* React 18 StrictMode в dev монтирует дерево дважды: без ref заставка проигралась бы дважды. */
const splashCompletedOnce = { done: false };

/**
 * Левое вертикальное меню: Мониторинг, Конфигуратор, Настройки.
 * Нижних вкладок нет — один список пунктов на всю сессию.
 */
function AppContent() {
  try {
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated, loading } = useContext(AuthContext);
    const { tryNavigate } = useLeaveConfirm();
    const { t } = useLanguage();
    const doNavigate = tryNavigate || navigate;

    const getActiveSidebarItem = () => {
      const p = location.pathname;
      if (p === '/monitoring/doors' || p === '/') return 'monitoring';
      if (p.startsWith('/configurator')) return 'configurator';
      if (p.startsWith('/settings')) return 'settings';
      return 'monitoring';
    };

    const [activeSidebarItem, setActiveSidebarItem] = useState(getActiveSidebarItem());

    useEffect(() => {
      setActiveSidebarItem(getActiveSidebarItem());
    }, [location.pathname]);

    if (loading) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          flexDirection: 'column',
          gap: '20px',
        }}
        >
          <div>{t('common.loading')}</div>
        </div>
      );
    }

    if (!isAuthenticated) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
        >
          <div>{t('common.loading')}</div>
        </div>
      );
    }

    const mainNavItems = [
      { id: 'monitoring', label: t('nav.monitoring'), path: '/monitoring/doors' },
      { id: 'configurator', label: t('nav.configurator'), path: '/configurator' },
      { id: 'settings', label: t('nav.settings'), path: '/settings/flash' },
    ];

    const handleSidebarItemClick = (itemId) => {
      setActiveSidebarItem(itemId);
      const item = mainNavItems.find((i) => i.id === itemId);
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
              items={mainNavItems}
              activeItem={activeSidebarItem}
              onItemClick={handleSidebarItemClick}
            />
            <div className="layout-content">
              <div className="layout-content-inner">
                <DoorsDataProvider>
                <ErrorBoundary>
                <Routes>
                <Route path="/" element={<Navigate to="/monitoring/doors" replace />} />
                <Route path="/dashboard" element={<Navigate to="/monitoring/doors" replace />} />
                <Route path="/login" element={<Navigate to="/monitoring/doors" replace />} />
                <Route path="/monitoring/statistics" element={<Navigate to="/monitoring/doors" replace />} />
                <Route path="/monitoring/alarms" element={<Navigate to="/monitoring/doors" replace />} />
                <Route path="/monitoring/events" element={<Navigate to="/monitoring/doors" replace />} />
                <Route path="/monitoring/doors" element={<ProtectedRoute path="/monitoring/doors"><Doors /></ProtectedRoute>} />
                <Route path="/configuration/doors" element={<Navigate to="/configurator" replace />} />
                <Route path="/configuration/mapping" element={<Navigate to="/configurator/mapping" replace />} />
                <Route path="/configurator" element={<ProtectedRoute path="/configurator"><DoorsConfig /></ProtectedRoute>} />
                <Route path="/configurator/mapping" element={<ProtectedRoute path="/configurator/mapping"><ErrorBoundary><Mapping /></ErrorBoundary></ProtectedRoute>} />
                <Route path="/settings/flash" element={<ProtectedRoute path="/settings/flash"><FlashSettings /></ProtectedRoute>} />
                <Route path="/settings/system" element={<Navigate to="/settings/flash" replace />} />
                <Route path="/settings/profile" element={<Navigate to="/settings/flash" replace />} />
                <Route path="/settings/about" element={<Navigate to="/settings/flash" replace />} />
                <Route path="/settings/help" element={<Navigate to="/settings/flash" replace />} />
                <Route path="/settings/help/:sectionId" element={<Navigate to="/settings/flash" replace />} />
                </Routes>
                </ErrorBoundary>
                </DoorsDataProvider>
              </div>
            </div>
          </div>
        </Layout>
        </StateDataProvider>
      </AppProvider>
    );
  } catch (error) {
    console.error('Ошибка в AppContent:', error);
    return (
      <div style={{ padding: '20px', fontFamily: 'Arial' }}>
        <h1>Ошибка отображения</h1>
        <p>{error.message}</p>
        <p>Проверьте консоль браузера (F12) для подробностей</p>
      </div>
    );
  }
}

function App() {
  const [splashDone, setSplashDone] = useState(() => splashCompletedOnce.done);

  try {
    return (
      <>
        {!splashDone && (
          <SplashScreen
            onComplete={() => {
              splashCompletedOnce.done = true;
              setSplashDone(true);
            }}
          />
        )}
        {splashDone && (
          <Router
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <AuthProvider>
              <LeaveConfirmProvider>
                <AppContent />
              </LeaveConfirmProvider>
            </AuthProvider>
          </Router>
        )}
      </>
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
