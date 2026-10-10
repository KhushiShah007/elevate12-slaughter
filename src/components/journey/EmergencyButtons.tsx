import { Link } from 'react-router-dom';
import { AlarmClockMinus, Clock4, Coffee, PlaneLanding, Shuffle } from 'lucide-react';
import { pastelBg, type Pastel } from '../../design/tokens';
import type { DisruptionType } from '../../types';
import { disruptionLabels } from '../../data/sampleDisruptions';

const buttons: { type: DisruptionType; pastel: Pastel; Icon: typeof Clock4 }[] = [
  { type: 'delay', pastel: 'rose', Icon: Clock4 },
  { type: 'missed', pastel: 'rose', Icon: PlaneLanding },
  { type: 'connecting', pastel: 'sky', Icon: Shuffle },
  { type: 'preponed', pastel: 'butter', Icon: AlarmClockMinus },
  { type: 'layover', pastel: 'mint', Icon: Coffee },
];

/** The five big "something's wrong" buttons. */
export function EmergencyButtons({ tripId }: { tripId: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {buttons.map(({ type, pastel, Icon }, i) => (
        <Link
          key={type}
          to={`/trips/${tripId}/disruption/${type}`}
          className={`flex min-h-[4.5rem] items-center gap-3 rounded-lg border border-ink/5 px-4 shadow-card transition active:scale-[0.98] ${pastelBg[pastel]} ${
            i === buttons.length - 1 ? 'col-span-2' : ''
          }`}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-paper/70 text-ink">
            <Icon size={20} />
          </span>
          <span className="font-display text-base leading-tight text-ink">{disruptionLabels[type]}</span>
        </Link>
      ))}
    </div>
  );
}
