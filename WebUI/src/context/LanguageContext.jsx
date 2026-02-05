/**
 * Контекст языка приложения: русский (по умолчанию) и английский.
 * Сохранение выбора в localStorage (ключ dcm-lang).
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import ru from '../locales/ru.json';
import en from '../locales/en.json';

const STORAGE_KEY = 'dcm-lang';
const translations = { ru, en };

export const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'ru') return saved;
    } catch (_) {}
    return 'ru';
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch (_) {}
  }, [language]);

  const setLanguage = useCallback((lang) => {
    if (lang === 'ru' || lang === 'en') setLanguageState(lang);
  }, []);

  const t = useCallback((key) => {
    const keys = key.split('.');
    let value = translations[language];
    for (const k of keys) {
      value = value?.[k];
    }
    return typeof value === 'string' ? value : key;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
