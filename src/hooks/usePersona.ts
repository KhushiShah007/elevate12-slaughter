import { useMemo } from 'react';
import { usePreferences } from './useTrip';
import { defaultPersona, derivePersona, type Persona } from '../engines/persona';

/** The traveller's persona from their saved quiz answers (a neutral one if they skipped). */
export function usePersona(): { persona: Persona; fromQuiz: boolean; notes: Record<string, string> } | undefined {
  const prefs = usePreferences();
  return useMemo(() => {
    if (prefs === undefined) return undefined;
    if (!prefs) return { persona: defaultPersona(), fromQuiz: false, notes: {} };
    return { persona: derivePersona(prefs.answers, prefs.notes), fromQuiz: true, notes: (prefs.notes ?? {}) as Record<string, string> };
  }, [prefs]);
}
