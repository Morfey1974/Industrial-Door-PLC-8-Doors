/**
 * AppContext - глобальный контекст приложения
 */

import { createContext, useState } from 'react';

export const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [activeTab, setActiveTab] = useState('monitoring');
  const [sidebarItems, setSidebarItems] = useState([]);

  return (
    <AppContext.Provider value={{ activeTab, setActiveTab, sidebarItems, setSidebarItems }}>
      {children}
    </AppContext.Provider>
  );
};
