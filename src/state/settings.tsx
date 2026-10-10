import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { TravellerPreferences } from '../types';

export type Language = 'en' | 'hi' | 'hinglish' | 'mr' | 'ta' | 'bn';

interface Settings {
  seniorMode: boolean;
  language: Language;
  persona: Partial<Record<keyof TravellerPreferences, string>> | null; // raw quiz answers
  signedIn: boolean;
  profile: { name: string; contact: string } | null; // demo account on this device
}

interface SettingsApi extends Settings {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

const KEY = 'voyage.settings';
const defaults: Settings = { seniorMode: false, language: 'en', persona: null, signedIn: false, profile: null };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

const Ctx = createContext<SettingsApi | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* storage blocked: settings stay in memory */
    }
    document.documentElement.dataset.senior = String(settings.seniorMode);
  }, [settings]);

  const api = useMemo<SettingsApi>(
    () => ({
      ...settings,
      update: (patch) => setSettings((s) => ({ ...s, ...patch })),
      reset: () => setSettings(defaults),
    }),
    [settings],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
