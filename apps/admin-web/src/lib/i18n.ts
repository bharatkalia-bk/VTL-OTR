import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import uiEn from '@vtl/ui/locales/en.json';

/** Admin portal is English-only (staff-facing); shared UI components still resolve their strings via i18n. */
void i18n.use(initReactI18next).init({ resources: { en: { ui: uiEn } }, lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false } });
export default i18n;
