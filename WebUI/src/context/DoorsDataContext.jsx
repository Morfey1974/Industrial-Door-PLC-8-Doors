/**
 * Данные дверей для «Мониторинг дверей» приходят из того же ответа, что и /api/state (includeDoors=1).
 * Отдельный GET /api/doors здесь не вызывается — проще для Ethernet и быстрее согласованность с шапкой.
 */

import { createContext, useContext, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useStateData } from './StateDataContext';
import { MONITOR_PATHS_WITH_DOORS } from '../utils/constants';

const DoorsDataContext = createContext(null);

async function idleRefetch() {
  return false;
}

const IDLE_VALUE = {
  data: null,
  loading: false,
  error: null,
  refetch: idleRefetch,
  lastSuccessAt: null,
};

export function DoorsDataProvider({ children }) {
  const location = useLocation();
  const pathAllowed = MONITOR_PATHS_WITH_DOORS.includes(location.pathname);
  const stateCtx = useStateData();

  const value = useMemo(() => {
    if (!pathAllowed) {
      return IDLE_VALUE;
    }
    const doorsArr = stateCtx.data?.doors;
    return {
      data: Array.isArray(doorsArr) ? { doors: doorsArr } : null,
      loading: stateCtx.loading,
      error: stateCtx.error,
      refetch: stateCtx.refetch,
      lastSuccessAt: stateCtx.lastSuccessAt,
    };
  }, [
    pathAllowed,
    stateCtx.data,
    stateCtx.loading,
    stateCtx.error,
    stateCtx.refetch,
    stateCtx.lastSuccessAt,
  ]);

  return (
    <DoorsDataContext.Provider value={value}>
      {children}
    </DoorsDataContext.Provider>
  );
}

export function useDoorsData() {
  const ctx = useContext(DoorsDataContext);
  if (!ctx) throw new Error('useDoorsData must be used within DoorsDataProvider');
  return ctx;
}
