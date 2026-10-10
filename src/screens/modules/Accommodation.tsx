import { BedDouble, MapPin, MoonStar } from 'lucide-react';
import { ModuleFrame } from './ModuleFrame';
import { TicketCard } from '../../components/cards/TicketCard';
import { day, inr } from '../../utils/format';

export default function Accommodation() {
  return (
    <ModuleFrame module="accommodation" title="Accommodation">
      {({ accommodations }) => (
        <div className="space-y-4">
          {accommodations.map((a, i) => (
            <TicketCard
              key={a.id}
              pastel={i % 2 ? undefined : 'peach'}
              stub={
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-[0.625rem] font-semibold uppercase tracking-widest text-muted">Check-in</p>
                    <p className="font-medium text-ink">{day(a.checkIn)}</p>
                  </div>
                  <div>
                    <p className="text-[0.625rem] font-semibold uppercase tracking-widest text-muted">Check-out</p>
                    <p className="font-medium text-ink">{day(a.checkOut)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[0.625rem] font-semibold uppercase tracking-widest text-muted">Total</p>
                    <p className="font-medium text-ink">{inr(a.amount)}</p>
                  </div>
                </div>
              }
            >
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-paper/70">
                  <BedDouble size={20} className="text-ink" />
                </span>
                <div>
                  <p className="font-display text-xl leading-tight text-ink">{a.name}</p>
                  <p className="mt-1 flex items-center gap-1 text-sm text-espresso">
                    <MapPin size={14} /> {a.area}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-sm text-espresso">
                    <MoonStar size={14} /> {a.nights} nights
                  </p>
                </div>
              </div>
              <p className="mt-3 rounded-sm bg-paper/60 px-3 py-2 text-xs text-espresso">{a.note}</p>
            </TicketCard>
          ))}
        </div>
      )}
    </ModuleFrame>
  );
}
