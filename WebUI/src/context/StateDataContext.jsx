/**
 * Состояние системы (сеть, Link, IP) для шапки; на страницах мониторинга — тот же ответ включает doors[].
 * Один HTTP-запрос вместо двух снижает нагрузку на однопоточный HTTP на МК и убирает рассинхрон «Нет связи» при живой таблице.
 */

import { createContext, useContext, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import useApi from '../hooks/useApi';
import { getState } from '../services/api';
import { isMonitorPathWithDoors } from '../utils/constants';

const StateDataContext = createContext(null);

export function StateDataProvider({ children }) {
  const location = useLocation();
  const includeDoors = isMonitorPathWithDoors(location.pathname);

  const fetcher = useCallback(
    (signal) => getState(signal, includeDoors),
    [includeDoors],
  );

  const stateData = useApi(fetcher, [includeDoors], {
    consecutiveFailuresForError: 4,
    /* Дольше таймаута axios на state+doors, иначе обрываем запрос раньше сервера и ловим ложные сбои. */
    silentStuckAbortMs: includeDoors ? 62000 : 12000,
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
