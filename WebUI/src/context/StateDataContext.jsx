/**
 * Состояние системы (сеть, Link, IP) для шапки на всех страницах.
 */

import { createContext, useContext } from 'react';
import useApi from '../hooks/useApi';
import { getState } from '../services/api';

const StateDataContext = createContext(null);

export function StateDataProvider({ children }) {
  /* Порог последовательных ошибок /state перед показом «Нет связи».
   * Держим небольшим, чтобы индикаторы в шапке реагировали на обрыв Ethernet
   * без долгой задержки, но при единичном кратком сбое не мигали.
   */
  const stateData = useApi(getState, [], {
    consecutiveFailuresForError: 2,
  });
  return (
    <StateDataContext.Provider value={stateData}>
      {children}
    </StateDataContext.Provider>
  );
}

export function useStateData() {
  const ctx = useContext(StateDataContext);
  if (!ctx) throw new Error('useStateData must be used within StateDataProvider');
  return ctx;
}
