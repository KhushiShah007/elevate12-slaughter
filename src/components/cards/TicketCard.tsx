import type { ReactNode } from 'react';
import { pastelBg, type Pastel } from '../../design/tokens';

/**
 * Boarding-pass style card: main body, a perforated tear line with half-circle
 * notches, and an optional stub below.
 */
export function TicketCard({ children, stub, pastel, className = '' }: {
  children: ReactNode;
  stub?: ReactNode;
  pastel?: Pastel;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-lg border border-line shadow-card ${pastel ? pastelBg[pastel] : 'bg-paper'} ${className}`}>
      <div className="p-5">{children}</div>
      {stub && (
        <>
          <div className="relative">
            <div className="mx-6 border-t-2 border-dashed border-ink/15" />
            <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full border border-line bg-ivory" />
            <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full border border-line bg-ivory" />
          </div>
          <div className="p-5 pt-4">{stub}</div>
        </>
      )}
    </div>
  );
}
