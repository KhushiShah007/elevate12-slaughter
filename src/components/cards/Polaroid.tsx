import type { ReactNode } from 'react';
import { pastelBg, type Pastel } from '../../design/tokens';

/** Polaroid photo. Prototype shows a pastel placeholder instead of a real photo. */
export function Polaroid({ pastel, caption, sub, icon, tilt = 0, className = 'w-36' }: {
  pastel: Pastel;
  caption: string;
  sub?: string;
  icon?: ReactNode;
  tilt?: number;
  className?: string;
}) {
  return (
    <figure className={`shrink-0 bg-paper p-2 pb-3 shadow-card ${className}`} style={{ transform: `rotate(${tilt}deg)` }}>
      <div className={`grain grid aspect-square place-items-center ${pastelBg[pastel]} text-ink/50`}>{icon}</div>
      <figcaption className="mt-2 font-display text-sm italic leading-snug text-espresso">
        {caption}
        {sub && <span className="block font-body text-[0.625rem] font-semibold uppercase not-italic tracking-widest text-muted">{sub}</span>}
      </figcaption>
    </figure>
  );
}
