import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, type Language } from './translations';
import { db } from '../db/database';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  language: 'id',
  setLanguage: async () => {},
  t: (key: string) => key,
});

const STORAGE_KEY = 'financeflow_language';

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Initial synchronous state: LocalStorage -> Navigator Language -> default 'id'
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(STORAGE_KEY) as Language;
        if (stored === 'en' || stored === 'id') return stored;
        
        // Auto-detect Indonesian browser locale
        if (navigator.language && navigator.language.toLowerCase().startsWith('id')) {
          return 'id';
        }
      }
    } catch (e) {
      // Fallback
    }
    return 'id';
  });

  // 2. Sync with Dexie IndexedDB settings on mount
  useEffect(() => {
    async function syncFromDb() {
      try {
        const s = await db.settings.get('current');
        if (s?.language && (s.language === 'en' || s.language === 'id')) {
          if (s.language !== language) {
            setLanguageState(s.language);
            localStorage.setItem(STORAGE_KEY, s.language);
          }
        }
      } catch (err) {
        // Non-blocking
      }
    }
    syncFromDb();
  }, []);

  const setLanguage = async (newLang: Language) => {
    setLanguageState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
      await db.settings.update('current', { language: newLang });
    } catch (err) {
      console.warn('Failed to persist language to settings:', err);
    }
  };

  /**
   * Translate key with optional parameter interpolation
   * e.g. t('nav.dashboard') or t('dashboard.acrossAccounts', { count: 3 })
   */
  const t = (key: string, params?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let value: any = translations[language];

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        value = undefined;
        break;
      }
    }

    // Fallback to English if missing in target language
    if (value === undefined && language !== 'en') {
      let fallbackValue: any = translations.en;
      for (const k of keys) {
        if (fallbackValue && typeof fallbackValue === 'object' && k in fallbackValue) {
          fallbackValue = fallbackValue[k];
        } else {
          fallbackValue = undefined;
          break;
        }
      }
      value = fallbackValue;
    }

    if (typeof value !== 'string') {
      return key; // return key itself as last fallback
    }

    // Parameter interpolation: {count} -> 3
    if (params) {
      let interpolated = value;
      for (const [pKey, pVal] of Object.entries(params)) {
        interpolated = interpolated.replace(new RegExp(`\\{${pKey}\\}`, 'g'), String(pVal));
      }
      return interpolated;
    }

    return value;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useTranslation = () => useContext(I18nContext);
