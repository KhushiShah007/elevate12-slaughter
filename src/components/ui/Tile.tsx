import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { pastelBg, type Pastel } from '../../design/tokens';

/** Pastel tile for grids: icon, title and a short line. */
export function Tile({ to, pastel, icon, title, sub, className = '' }: {
  to: string;
  pastel: Pastel;
  icon: ReactNode;
  title: string;
  sub?: string;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={`group relative flex min-h-[7.5rem] flex-col justify-between overflow-hidden rounded-lg border border-ink/5 p-4 shadow-card transition active:scale-[0.98] ${pastelBg[pastel]} ${className}`}
    >
      <span className="grid h-10 w-10 place-items-center rounded-full bg-paper/70 text-ink">{icon}</span>
      <span>
        <span className="block font-display text-lg leading-tight text-ink">{title}</span>
        {sub && <span className="mt-0.5 block text-xs text-espresso/80">{sub}</span>}
      </span>
    </Link>
  );
}
