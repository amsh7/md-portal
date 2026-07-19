import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ar from './ar.json';

const stored = localStorage.getItem('md-portal-lang');
const initialLang = stored === 'ar' || stored === 'en' ? stored : 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: initialLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function applyDirection(lang: string) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

export function switchLanguage(lang: 'en' | 'ar') {
  localStorage.setItem('md-portal-lang', lang);
  i18n.changeLanguage(lang);
  applyDirection(lang);
}

applyDirection(initialLang);

export default i18n;
