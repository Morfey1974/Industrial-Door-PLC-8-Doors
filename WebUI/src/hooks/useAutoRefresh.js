/**
 * useAutoRefresh хук - для автообновления данных
 */

import { useEffect, useRef } from 'react';

const useAutoRefresh = (callback, interval = 5000) => {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      callbackRef.current();
    }, interval);

    return () => clearInterval(intervalId);
  }, [interval]);
};

export default useAutoRefresh;
