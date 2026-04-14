/**
 * Локализация: только русский язык (единый интерфейс без переключения).
 */

import { createContext, useContext, useCallback } from 'react';
import ru from '../locales/ru.json';

export const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  /**
   * Перевод по ключу вида «pages.config.saveConfig».
   * Второй аргумент — объект подстановок: {name}, {count} и т.д. в строке перевода.
   */
  const t = useCallback((key, params) => {
    const keys = key.split('.');
    let value = ru;
    for (const k of keys) {
      value = value?.[k];
    }
    let out = typeof value === 'string' ? value : key;
    if (typeof out === 'string' && params && typeof params === 'object') {
      for (const [pk, pv] of Object.entries(params)) {
        out = out.split(`{${pk}}`).join(pv != null ? String(pv) : `{${pk}}`);
      }
    }
    return out;
  }, []);

  return (
    <LanguageContext.Provider value={{ language: 'ru', setLanguage: () => {}, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
