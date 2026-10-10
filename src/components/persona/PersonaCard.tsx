import { Check } from 'lucide-react';
import type { Persona } from '../../engines/persona';
import { useT, type MessageKey } from '../../i18n';
import { inr } from '../../utils/format';
import { StampCard } from '../cards/StampCard';

/** Persona as a postage stamp. */
export function PersonaStamp({ persona, className = 'w-56', size = 'lg' }: { persona: Persona; className?: string; size?: 'lg' | 'sm' }) {
  const { t } = useT();
  return (
    <StampCard pastel="mint" tilt={-3} className={className}>
      <span className={size === 'lg' ? 'text-5xl' : 'text-3xl'}>{persona.emoji}</span>
      <p className={`mt-2 font-display leading-tight text-ink ${size === 'lg' ? 'text-2xl' : 'text-base'}`}>{t(`persona.${persona.id}.title` as MessageKey)}</p>
      {size === 'lg' && <p className="mt-1 text-xs text-espresso">{t(`persona.${persona.id}.blurb` as MessageKey)}</p>}
    </StampCard>
  );
}

/** What the persona actually changes in the app, in plain words. */
export function PersonaEffects({ persona }: { persona: Persona }) {
  const { t } = useT();
  const lines = [
    t('effect.pace', { n: persona.activitiesPerDay }),
    persona.vegFirst && t('effect.veg'),
    persona.jain && t('effect.jain'),
    persona.interests[0] && t('effect.interests', { topic: t(`interest.${persona.interests[0]}` as MessageKey) }),
    t('effect.value', { amount: inr(persona.valueOfHourInr) }),
  ].filter(Boolean) as string[];

  return (
    <ul className="space-y-2">
      {lines.map((line) => (
        <li key={line} className="flex items-start gap-2 text-sm text-ink">
          <Check size={16} className="mt-0.5 shrink-0 text-ok" />
          {line}
        </li>
      ))}
    </ul>
  );
}
