'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type UiLocale = 'id' | 'en' | 'zh';

type LanguageContextValue = {
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = 'auria.ui.locale';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<UiLocale>('id');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'id' || stored === 'en' || stored === 'zh') setLocaleState(stored);
    } catch { /* default Bahasa Indonesia */ }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : locale;
    try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* persistence is optional */ }
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale: setLocaleState }), [locale]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}
