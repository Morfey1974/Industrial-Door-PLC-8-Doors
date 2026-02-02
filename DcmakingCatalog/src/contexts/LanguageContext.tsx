import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { translations, type Lang } from "@/data/translations";

type Translations = (typeof translations)["en"];

function getNested(obj: Translations, path: string): string {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    current = (current as Record<string, unknown>)?.[key];
  }
  return typeof current === "string" ? current : path;
}

type LanguageContextType = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (path: string) => string;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

const STORAGE_KEY = "dcm-lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "en";
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored === "en" || stored === "ru" || stored === "he") return stored;
    return "en";
  });

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem(STORAGE_KEY, newLang);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (lang === "he") {
      root.setAttribute("dir", "rtl");
      root.setAttribute("lang", "he");
    } else {
      root.setAttribute("dir", "ltr");
      root.setAttribute("lang", lang === "ru" ? "ru" : "en");
    }
  }, [lang]);

  const t = useCallback(
    (path: string) => getNested(translations[lang], path),
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
