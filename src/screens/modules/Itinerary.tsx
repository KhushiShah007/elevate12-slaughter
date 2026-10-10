import { useState } from 'react';
import { BedDouble, Camera, Plane, TrainFront, Utensils } from 'lucide-react';
import { ModuleFrame } from './ModuleFrame';
import type { ItineraryItem } from '../../types';
import { day } from '../../utils/format';

const kindIcon: Record<ItineraryItem['kind'], typeof Plane> = {
  flight: Plane,
  stay: BedDouble,
  food: Utensils,
  see: Camera,
  move: TrainFront,
};

export default function Itinerary() {
  const [dayId, setDayId] = useState<string | null>(null);

  return (
    <ModuleFrame module="itinerary" title="Itinerary">
      {({ days, items }) => {
        const active = dayId ?? days[0]?.id;
        const current = days.find((d) => d.id === active);
        return (
          <>
            {/* Calendar strip */}
            <div className="no-scrollbar -mx-gutter flex gap-2 overflow-x-auto px-gutter pb-2">
              {days.map((d) => {
                const on = d.id === active;
                return (
                  <button
                    key={d.id}
                    onClick={() => setDayId(d.id)}
                    className={`flex min-h-[4.5rem] w-16 shrink-0 flex-col items-center justify-center rounded-md border ${
                      on ? 'border-ink bg-ink text-ivory' : 'border-line bg-paper text-ink'
                    }`}
                  >
                    <span className="text-[0.625rem] font-semibold uppercase tracking-widest opacity-80">{day(d.date, { weekday: 'short' })}</span>
                    <span className="font-display text-2xl">{day(d.date, { day: 'numeric' })}</span>
                  </button>
                );
              })}
            </div>

            {current && (
              <div className="mt-4 rounded-lg border border-line bg-paper p-5 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">{day(current.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <h2 className="mt-1 text-2xl">{current.title}</h2>
                <ol className="mt-4 space-y-1">
                  {items
                    .filter((it) => it.dayId === current.id)
                    .map((it) => {
                      const Icon = kindIcon[it.kind];
                      return (
                        <li key={it.id} className="flex min-h-tap items-center gap-3">
                          <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-espresso">{it.time}</span>
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-lavender">
                            <Icon size={16} className="text-ink" />
                          </span>
                          <span className="text-sm text-ink">{it.title}</span>
                        </li>
                      );
                    })}
                </ol>
              </div>
            )}
          </>
        );
      }}
    </ModuleFrame>
  );
}
