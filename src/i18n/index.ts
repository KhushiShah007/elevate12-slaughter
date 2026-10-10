import { useCallback, useEffect } from 'react';
import { useSettings, type Language } from '../state/settings';
import { en, type MessageKey, type Messages } from './locales/en';
import { hi } from './locales/hi';
import { hinglish } from './locales/hinglish';
import { mr } from './locales/mr';
import { ta } from './locales/ta';
import { bn } from './locales/bn';

export type { MessageKey } from './locales/en';

export interface LanguageInfo {
  code: Language;
  native: string; // shown in the picker
  english: string; // used in prompts and replies
  htmlLang: string; // <html lang>
  speech: string; // speech recognition / read-aloud voice
  intl: string; // dates
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'en', native: 'English', english: 'English', htmlLang: 'en', speech: 'en-IN', intl: 'en-IN' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi', htmlLang: 'hi', speech: 'hi-IN', intl: 'hi-IN' },
  { code: 'hinglish', native: 'Hinglish', english: 'Hinglish', htmlLang: 'hi-Latn', speech: 'hi-IN', intl: 'en-IN' },
  { code: 'mr', native: 'मराठी', english: 'Marathi', htmlLang: 'mr', speech: 'mr-IN', intl: 'mr-IN' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil', htmlLang: 'ta', speech: 'ta-IN', intl: 'ta-IN' },
  { code: 'bn', native: 'বাংলা', english: 'Bengali', htmlLang: 'bn', speech: 'bn-IN', intl: 'bn-IN' },
];

export const languageInfo = (code: Language) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];

const dictionaries: Record<Language, Messages> = { en, hi, hinglish, mr, ta, bn };

export type Params = Record<string, string | number>;

/** Look up a string and fill {placeholders}. Falls back to English, then to the key. */
export function translate(lang: Language, key: MessageKey, params?: Params): string {
  const template = dictionaries[lang]?.[key] ?? en[key] ?? key;
  return params ? template.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : template;
}

/** t() for the current language. Re-renders when the language changes. */
export function useT() {
  const { language } = useSettings();
  const t = useCallback((key: MessageKey, params?: Params) => translate(language, key, params), [language]);
  return { t, lang: language, info: languageInfo(language) };
}

/** Keep <html lang> in step with the chosen language (screen readers, fonts, hyphenation). */
export function useDocumentLanguage() {
  const { info } = useT();
  useEffect(() => {
    document.documentElement.lang = info.htmlLang;
  }, [info.htmlLang]);
}
