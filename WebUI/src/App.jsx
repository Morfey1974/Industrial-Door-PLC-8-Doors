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
import Profile from './pages/Settings/Profile';
import './styles/main.css';

// Компонент для управления навигацией
function AppContent() {
  try {
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Все хуки должны вызываться ДО любых условных возвратов
    // Это правило React Hooks - хуки должны вызываться в одном и том же порядке на каждом рендере
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated, loading } = useContext(AuthContext);

    // Определяем активную вкладку на основе текущего пути
    const getActiveTab = () => {
      if (location.pathname.startsWith('/monitoring')) return 'monitoring';
      if (location.pathname.startsWith('/configuration')) return 'configuration';
      if (location.pathname.startsWith('/settings')) return 'settings';
      return 'monitoring'; // По умолчанию
    };

    // Определяем активный элемент сайдбара на основе текущего пути
    const getActiveSidebarItem = () => {
      if (location.pathname === '/monitoring/doors' || location.pathname === '/') return 'doors';
      if (location.pathname === '/monitoring/events') return 'events';
      if (location.pathname === '/monitoring/alarms') return 'alarms';
      if (location.pathname === '/monitoring/statistics') return 'statistics';
      if (location.pathname === '/configuration/doors') return 'doors-config';
      if (location.pathname === '/configuration/network') return 'network-config';
      if (location.pathname === '/configuration/system') return 'system-params';
      if (location.pathname === '/settings/profile') return 'profile';
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

    // Показываем загрузку при проверке аутентификации
    if (loading) {
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

    // Если не аутентифицирован, показываем страницу входа
    if (!isAuthenticated) {
      return <Login />;
    }

    const tabs = [
      { id: 'monitoring', label: 'Мониторинг' },
      { id: 'configuration', label: 'Конфигурация' },
      { id: 'settings', label: 'Настройки' },
    ];

    const sidebarItems = {
      monitoring: [
        { id: 'doors', label: 'Двери', path: '/monitoring/doors' },
        { id: 'events', label: 'События', path: '/monitoring/events' },
        { id: 'alarms', label: 'Алармы', path: '/monitoring/alarms' },
        { id: 'statistics', label: 'Статистика', path: '/monitoring/statistics' },
      ],
      configuration: [
        { id: 'doors-config', label: 'Настройка дверей', path: '/configuration/doors' },
        { id: 'network-config', label: 'Сетевые настройки', path: '/configuration/network' },
        { id: 'system-params', label: 'Параметры системы', path: '/configuration/system' },
      ],
      settings: [
        { id: 'profile', label: 'Профиль', path: '/settings/profile' },
      ],
    };

    const handleTabChange = (tabId) => {
      setActiveTab(tabId);
      // Переходим на первый элемент выбранной вкладки
      const items = sidebarItems[tabId];
      if (items && items.length > 0) {
        navigate(items[0].path);
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
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/monitoring/doors" element={<Doors />} />
                <Route path="/monitoring/events" element={<Events />} />
                <Route path="/monitoring/alarms" element={<Alarms />} />
                <Route path="/monitoring/statistics" element={<Statistics />} />
                <Route path="/configuration/doors" element={<DoorsConfig />} />
                <Route path="/configuration/network" element={<NetworkConfig />} />
                <Route path="/configuration/system" element={<SystemParams />} />
                <Route path="/settings/profile" element={<Profile />} />
              </Routes>
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
