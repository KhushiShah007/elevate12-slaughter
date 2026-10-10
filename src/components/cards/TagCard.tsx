import type { ReactNode } from 'react';
import { pastelBg, type Pastel } from '../../design/tokens';

/** Luggage-tag card: an eyelet on the left, a stitched divider, then the content. */
export function TagCard({ pastel, side, children, onClick, className = '' }: {
  pastel: Pastel;
  side?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={`flex w-full items-stretch overflow-hidden rounded-md rounded-l-[2.25rem] border border-ink/5 text-left shadow-card ${pastelBg[pastel]} ${className}`}
    >
      <div className="flex w-16 shrink-0 flex-col items-center justify-center gap-2 border-r-2 border-dashed border-ink/15 py-4 text-ink">
        <span className="h-3.5 w-3.5 rounded-full border-2 border-ink/25 bg-ivory" />
        {side}
      </div>
      <div className="min-w-0 flex-1 p-4">{children}</div>
    </Comp>
  );
}
