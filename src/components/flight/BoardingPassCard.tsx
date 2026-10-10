import type { ReactNode } from 'react';
import type { Flight, RiskLevel } from '../../types';
import type { Pastel } from '../../design/tokens';
import { clock, day, duration } from '../../utils/format';
import { minutesBetween } from '../../engines/connectionRisk';
import { TicketCard } from '../cards/TicketCard';
import { PlaneOnDottedLine } from './PlaneOnDottedLine';
import { RiskBadge } from './RiskBadge';

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[0.625rem] font-semibold uppercase tracking-widest text-muted">{label}</p>
      <p className="font-display text-lg text-ink">{value}</p>
    </div>
  );
}

export function BoardingPassCard({ flight, risk, pastel, footer }: {
  flight: Flight;
  risk?: RiskLevel;
  pastel?: Pastel;
  footer?: ReactNode;
}) {
  // Flight time in minutes from the two offset-aware timestamps.
  const flightMin = minutesBetween(flight.depart, flight.arrive);

  return (
    <TicketCard
      pastel={pastel}
      stub={
        <>
          <div className="grid grid-cols-4 gap-2">
            <Field label="Gate" value={flight.gate ?? '—'} />
            <Field label="Seat" value={flight.seat ?? '—'} />
            <Field label="Board" value={flight.boarding ? clock(flight.boarding) : '—'} />
            <Field label="Term." value={flight.terminal} />
          </div>
          {(risk || footer) && (
            <div className="mt-4 flex items-center justify-between gap-2">
              {risk ? <RiskBadge level={risk} /> : <span />}
              {footer}
            </div>
          )}
        </>
      }
    >
      <div className="mb-3 flex items-center justify-between text-xs text-espresso">
        <span className="font-semibold uppercase tracking-widest">{flight.airline}</span>
        <span>
          {flight.flightNo} · {day(flight.depart)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div>
          <p className="font-display text-[2.5rem] leading-none text-ink">{flight.fromCode}</p>
          <p className="mt-1 text-xs text-muted">{flight.fromCity}</p>
          <p className="text-sm font-semibold text-ink">{clock(flight.depart)}</p>
        </div>
        <PlaneOnDottedLine label={duration(flightMin)} />
        <div className="text-right">
          <p className="font-display text-[2.5rem] leading-none text-ink">{flight.toCode}</p>
          <p className="mt-1 text-xs text-muted">{flight.toCity}</p>
          <p className="text-sm font-semibold text-ink">{clock(flight.arrive)}</p>
        </div>
      </div>
    </TicketCard>
  );
}
