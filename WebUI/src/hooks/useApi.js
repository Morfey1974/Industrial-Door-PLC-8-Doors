/**
 * useApi хук - для работы с API запросами
 * Оптимизирован для предотвращения постоянных перезагрузок
 */

import { useState, useEffect, useRef } from 'react';

const useApi = (apiFunction, dependencies = []) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isFetchingRef = useRef(false);
  const abortControllerRef = useRef(null);

  // Функция для сравнения данных (глубокое сравнение для объектов)
  const isDataEqual = (oldData, newData) => {
    if (oldData === newData) return true;
    if (!oldData || !newData) return false;
    
    // Для массивов объектов (например, doors)
    if (Array.isArray(oldData) && Array.isArray(newData)) {
      if (oldData.length !== newData.length) return false;
      return JSON.stringify(oldData) === JSON.stringify(newData);
    }
    
    // Для объектов
    if (typeof oldData === 'object' && typeof newData === 'object') {
      return JSON.stringify(oldData) === JSON.stringify(newData);
    }
    
    return oldData === newData;
  };

  useEffect(() => {
    let isMounted = true;
    let timeoutId = null;

    const fetchData = async () => {
      // Предотвращаем множественные одновременные запросы
      if (isFetchingRef.current) {
        return;
      }

      // Отменяем предыдущий запрос, если он еще выполняется
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      isFetchingRef.current = true;

      // Устанавливаем таймаут для показа ошибки, если запрос слишком долгий
      timeoutId = setTimeout(() => {
        if (isMounted && isFetchingRef.current && !abortControllerRef.current?.signal.aborted) {
          console.warn('Запрос выполняется слишком долго, возможно проблема с сетью');
          // Не прерываем запрос, но логируем предупреждение
        }
      }, 15000); // 15 секунд - предупреждение

      try {
        setLoading(true);
        setError(null);
        // Передаем signal для возможности отмены запроса
        const startTime = Date.now();
        const result = await apiFunction(abortControllerRef.current.signal);
        const duration = Date.now() - startTime;
        if (duration > 5000) {
          console.log(`API запрос занял ${duration}ms (медленно)`);
        }
        
        // Очищаем таймаут при успешном завершении
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        
        if (isMounted && !abortControllerRef.current?.signal.aborted) {
          // Обновляем данные только если они изменились
          setData((prevData) => {
            if (isDataEqual(prevData, result)) {
              return prevData; // Не обновляем, если данные не изменились
            }
            return result;
          });
        }
      } catch (err) {
        // Очищаем таймаут при ошибке
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        
        // Игнорируем ошибки отмены запроса
        if (err.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
          return;
        }
        
        if (isMounted && !abortControllerRef.current?.signal.aborted) {
          // Не показываем ошибку, если уже есть данные (тихое обновление)
          if (!data) {
            setError(err.message || 'Ошибка загрузки данных');
          } else {
            // Логируем ошибку, но не показываем пользователю при автообновлении
            console.warn('Ошибка автообновления данных:', err.message);
          }
        }
      } finally {
        if (isMounted && !abortControllerRef.current?.signal.aborted) {
          setLoading(false);
        }
        isFetchingRef.current = false;
      }
    };

    fetchData();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      isFetchingRef.current = false;
    };
  }, dependencies);

  // Тихое обновление без показа loading состояния
  const refetch = async (silent = false) => {
    // Предотвращаем множественные одновременные запросы
    if (isFetchingRef.current) {
      return;
    }

    // Отменяем предыдущий запрос
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    isFetchingRef.current = true;
    let timeoutId = null;

    // Устанавливаем таймаут для тихого обновления тоже
    if (!silent) {
      timeoutId = setTimeout(() => {
        if (isFetchingRef.current && !abortControllerRef.current?.signal.aborted) {
          console.warn('Запрос выполняется слишком долго');
        }
      }, 15000);
    }

    try {
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      
      // Передаем signal для возможности отмены запроса
      const result = await apiFunction(abortControllerRef.current.signal);
      
      // Очищаем таймаут
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      if (!abortControllerRef.current?.signal.aborted) {
        // Обновляем данные только если они изменились
        setData((prevData) => {
          if (isDataEqual(prevData, result)) {
            return prevData; // Не обновляем, если данные не изменились
          }
          return result;
        });
      }
    } catch (err) {
      // Очищаем таймаут при ошибке
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      // Игнорируем ошибки отмены запроса
      if (err.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
        return;
      }
      
      if (!abortControllerRef.current?.signal.aborted) {
        if (silent) {
          // При тихом обновлении только логируем ошибку
          console.warn('Ошибка автообновления данных:', err.message);
        } else {
          setError(err.message || 'Ошибка загрузки данных');
        }
      }
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        if (!silent) {
          setLoading(false);
        }
      }
      isFetchingRef.current = false;
    }
  };

  return { data, loading, error, refetch };
};

export default useApi;
