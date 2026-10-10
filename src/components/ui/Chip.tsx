import type { ReactNode } from 'react';
import type { RiskLevel } from '../../types';
import { useT } from '../../i18n';

type Tone = 'neutral' | RiskLevel;

const tones: Record<Tone, { box: string; dot: string }> = {
  neutral: { box: 'bg-sand/70 border-line', dot: 'bg-muted' },
  ok: { box: 'bg-ok/10 border-ok/30', dot: 'bg-ok' },
  warn: { box: 'bg-warn/10 border-warn/40', dot: 'bg-warn' },
  bad: { box: 'bg-bad/10 border-bad/30', dot: 'bg-bad' },
};

/** Small label. Text stays dark; the tone shows in the dot and tint. */
export function Chip({ tone = 'neutral', icon, dot, children, className = '' }: {
  tone?: Tone;
  icon?: ReactNode;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-pill text-left leading-tight border px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-espresso ${t.box} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />}
      {icon}
      {children}
    </span>
  );
}

export function SampleTag() {
  const { t } = useT();
  return <Chip>{t('common.sampleData')}</Chip>;
}
