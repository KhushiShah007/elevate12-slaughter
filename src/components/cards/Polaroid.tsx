import type { ReactNode } from 'react';
import { pastelBg, type Pastel } from '../../design/tokens';

/** Polaroid photo. Prototype shows a pastel placeholder instead of a real photo. */
export function Polaroid({ pastel, caption, icon, tilt = 0 }: { pastel: Pastel; caption: string; icon?: ReactNode; tilt?: number }) {
  return (
    <figure className="w-36 shrink-0 bg-paper p-2 pb-3 shadow-card" style={{ transform: `rotate(${tilt}deg)` }}>
      <div className={`grain grid aspect-square place-items-center ${pastelBg[pastel]} text-ink/50`}>{icon}</div>
      <figcaption className="mt-2 font-display text-sm italic leading-snug text-espresso">{caption}</figcaption>
    </figure>
  );
}
