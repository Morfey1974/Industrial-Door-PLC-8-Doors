/**
 * useAutoRefresh хук - для автообновления данных
 * Оптимизирован для предотвращения множественных одновременных вызовов
 */

import { useEffect, useRef } from 'react';

const useAutoRefresh = (callback, interval = 5000) => {
  const callbackRef = useRef(callback);
  const isRunningRef = useRef(false);
  const intervalIdRef = useRef(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    // Очищаем предыдущий интервал, если он существует
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
    }

    intervalIdRef.current = setInterval(() => {
      // Предотвращаем множественные одновременные вызовы
      if (isRunningRef.current) {
        return;
      }

      isRunningRef.current = true;
      
      // Вызываем callback и сбрасываем флаг после завершения
      Promise.resolve(callbackRef.current())
        .catch((error) => {
          console.error('Auto refresh callback error:', error);
        })
        .finally(() => {
          // Небольшая задержка перед сбросом флага для предотвращения race condition
          setTimeout(() => {
            isRunningRef.current = false;
          }, 100);
        });
    }, interval);

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      isRunningRef.current = false;
    };
  }, [interval]);
};

export default useAutoRefresh;
