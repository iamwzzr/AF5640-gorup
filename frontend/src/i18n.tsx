import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Languages } from 'lucide-react';
import { LANGUAGE_STORAGE_KEY, translate } from './locale';
import type { Language, MessageValues } from './locale';

interface LanguageContext {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (message: string, values?: MessageValues) => string;
}
const Context = createContext<LanguageContext | null>(null);
function initialLanguage(): Language {
  try { return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'zh'; }
  catch { return 'zh'; } // Storage can be unavailable; switching still works in memory.
}
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language); }
    catch { /* The selected language remains active when browser storage is disabled. */ }
  }, [language]);
  const context = useMemo(() => ({ language, setLanguage, t: (message: string, values?: MessageValues) => translate(message, language, values) }), [language]);
  return <Context.Provider value={context}>{children}</Context.Provider>;
}
export function useI18n(): LanguageContext {
  const context = useContext(Context);
  if (!context) throw new Error('LanguageProvider is required');
  return context;
}
export function LanguageSwitch() {
  const { language, setLanguage, t } = useI18n();
  return <div className="language-switch" role="group" aria-label={t('选择语言')}>
    <Languages size={16} aria-hidden="true"/>
    <button type="button" lang="zh-CN" aria-label="切换至中文" aria-pressed={language === 'zh'} onClick={() => setLanguage('zh')}>中文</button>
    <button type="button" lang="en" aria-label="Switch to English" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</button>
  </div>;
}
