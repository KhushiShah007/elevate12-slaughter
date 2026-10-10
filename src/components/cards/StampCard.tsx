import type { ReactNode } from 'react';
import { pastelBg, type Pastel } from '../../design/tokens';

/** Postage stamp: perforated edge, inner frame, slight tilt. */
export function StampCard({ pastel, tilt = 0, children, className = '' }: {
  pastel: Pastel;
  tilt?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`drop-shadow-stamp ${className}`} style={{ transform: `rotate(${tilt}deg)` }}>
      <div className="perforated h-full bg-paper">
        <div className={`flex h-full flex-col items-center justify-center border border-ink/20 p-3 text-center ${pastelBg[pastel]}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
