/**
 * Общий кэш состояния дверей для страниц Мониторинг и Дашборд.
 * Запросы GET /api/doors только когда активна Главная или «Мониторинг дверей».
 */

import { createContext, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import useApi from '../hooks/useApi';
import { getDoors } from '../services/api';

const DoorsDataContext = createContext(null);

const DOORS_PATHS = ['/', '/dashboard', '/monitoring/doors'];

export function DoorsDataProvider({ children }) {
  const location = useLocation();
  const enabled = DOORS_PATHS.includes(location.pathname);
  const doorsState = useApi(getDoors, [], { enabled });
  return (
    <DoorsDataContext.Provider value={doorsState}>
      {children}
    </DoorsDataContext.Provider>
  );
}

export function useDoorsData() {
  const ctx = useContext(DoorsDataContext);
  if (!ctx) throw new Error('useDoorsData must be used within DoorsDataProvider');
  return ctx;
}
