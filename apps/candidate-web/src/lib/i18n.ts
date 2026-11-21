import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import uiEn from '@vtl/ui/locales/en.json';
import uiHi from '@vtl/ui/locales/hi.json';
import en from '../locales/en.json';
import hi from '../locales/hi.json';

function initialLang(): 'en' | 'hi' {
  try {
    const s = localStorage.getItem('vtl.lang');
    if (s === 'en' || s === 'hi') return s;
  } catch { /* storage unavailable */ }
  return navigator.language?.startsWith('hi') ? 'hi' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en, ui: uiEn }, hi: { translation: hi, ui: uiHi } },
  lng: initialLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

function apply(lng: string) {
  document.documentElement.lang = lng;
  try { localStorage.setItem('vtl.lang', lng); } catch { /* ignore */ }
}
apply(i18n.language);
i18n.on('languageChanged', apply);

export default i18n;
