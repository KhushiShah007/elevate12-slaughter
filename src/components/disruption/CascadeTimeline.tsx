import { motion } from 'framer-motion';
import { AlertTriangle, BedDouble, Car, Clock, Coffee, Plane, Users } from 'lucide-react';
import type { CascadeEffect, CascadeResult, RiskLevel } from '../../types';
import { fadeUp, stagger } from '../../design/motion';
import { RedRipple } from './RedRipple';

const icons: Record<CascadeEffect['icon'], typeof Plane> = {
  plane: Plane,
  hotel: BedDouble,
  car: Car,
  family: Users,
  coffee: Coffee,
  clock: Clock,
};

const ring: Record<RiskLevel, string> = {
  ok: 'border-ok/50 bg-ok/10',
  warn: 'border-warn/50 bg-warn/10',
  bad: 'border-bad/50 bg-bad/10',
};

const levelWord: Record<RiskLevel, string> = { ok: 'Fine', warn: 'Affected', bad: 'Breaks' };

/** What the trigger breaks, one knock-on effect at a time. */
export function CascadeTimeline({ d }: { d: CascadeResult }) {
  const breaks = !!d.brokenAt || d.effects.some((e) => e.level === 'bad');
  const tight = !breaks && d.effects.some((e) => e.level === 'warn');
  return (
    <div className="rounded-lg border border-line bg-paper p-4 shadow-card">
      <div className="flex items-center gap-3">
        {breaks ? (
          <RedRipple>
            <AlertTriangle size={20} />
          </RedRipple>
        ) : (
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-paper ${tight ? 'bg-warn' : 'bg-ok'}`}>
            {tight ? <Clock size={20} /> : <Coffee size={20} />}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-display text-xl leading-tight text-ink">{d.headline}</p>
          <p className="text-sm text-muted">{d.trigger}</p>
        </div>
      </div>

      {d.effects.length > 0 && (
      <motion.ol variants={stagger(0.25)} initial="hidden" animate="show" className="ml-[1.3rem] mt-4 border-l-2 border-dashed border-line pl-5">
        {d.effects.map((e) => {
          const Icon = icons[e.icon];
          return (
            <motion.li key={e.id} variants={fadeUp} className="relative pb-3 last:pb-0">
              <span className="absolute -left-[1.85rem] top-3 h-3 w-3 rounded-full border-2 border-paper bg-line" />
              <div className={`flex items-start gap-3 rounded-md border p-3 ${ring[e.level]}`}>
                <Icon size={18} className="mt-0.5 shrink-0 text-ink" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">{e.label}</p>
                    <span className="text-[0.625rem] font-bold uppercase tracking-widest text-espresso">{levelWord[e.level]}</span>
                  </div>
                  <p className="text-sm text-espresso">{e.detail}</p>
                </div>
              </div>
            </motion.li>
          );
        })}
      </motion.ol>
      )}
    </div>
  );
}
