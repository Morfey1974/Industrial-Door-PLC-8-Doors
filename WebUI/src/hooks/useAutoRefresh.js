/**
 * useAutoRefresh хук - для автообновления данных
 * Опрос только при видимой вкладке (Page Visibility API).
 *
 * setInterval + пропуск тика, если предыдущий callback ещё выполняется — даёт стабильный
 * интервал по времени и быстрое обновление таблицы мониторинга при коротком ответе МК.
 */

import { useEffect, useRef, useState } from 'react';

const getVisible = () => typeof document !== 'undefined' && document.visibilityState === 'visible';

const useAutoRefresh = (callback, interval = 5000) => {
  const callbackRef = useRef(callback);
  const isRunningRef = useRef(false);
  const intervalIdRef = useRef(null);
  const [visible, setVisible] = useState(getVisible);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const onVisibilityChange = () => setVisible(getVisible());
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }

    if (!visible || interval <= 0) return undefined;

    const tick = () => {
      if (!getVisible()) return;
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      Promise.resolve(callbackRef.current())
        .catch((err) => console.error('Auto refresh callback error:', err))
        .finally(() => {
          isRunningRef.current = false;
        });
    };

    intervalIdRef.current = setInterval(tick, interval);

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      isRunningRef.current = false;
    };
  }, [interval, visible]);
};

export default useAutoRefresh;
