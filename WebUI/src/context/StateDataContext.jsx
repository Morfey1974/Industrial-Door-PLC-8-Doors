/**
 * Состояние системы (сеть, Link, IP) для шапки на всех страницах.
 */

import { createContext, useContext } from 'react';
import useApi from '../hooks/useApi';
import { getState } from '../services/api';

const StateDataContext = createContext(null);

export function StateDataProvider({ children }) {
  // Порог последовательных неудач опроса /state перед показом «Нет связи».
  // Увеличен, чтобы индикаторы сети/линка не краснели из‑за долгой загрузки других страниц (например журнала).
  const stateData = useApi(getState, [], {
    consecutiveFailuresForError: 15,
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
