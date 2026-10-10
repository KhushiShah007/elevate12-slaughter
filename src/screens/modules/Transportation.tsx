import { Bus, Car, TrainFront, TramFront } from 'lucide-react';
import { ModuleFrame } from './ModuleFrame';
import { TagCard } from '../../components/cards/TagCard';
import type { TransportBooking } from '../../types';
import type { Pastel } from '../../design/tokens';
import { clock, day, inr } from '../../utils/format';

const modeLook: Record<TransportBooking['mode'], { Icon: typeof Car; pastel: Pastel }> = {
  cab: { Icon: Car, pastel: 'butter' },
  train: { Icon: TrainFront, pastel: 'sky' },
  metro: { Icon: TramFront, pastel: 'mint' },
  bus: { Icon: Bus, pastel: 'peach' },
};

export default function Transportation() {
  return (
    <ModuleFrame module="transportation" title="Transportation">
      {({ transport }) => (
        <div className="space-y-3">
          {transport.map((t) => {
            const { Icon, pastel } = modeLook[t.mode];
            return (
              <TagCard key={t.id} pastel={pastel} side={<Icon size={20} />}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-lg leading-tight text-ink">{t.title}</p>
                  <p className="shrink-0 text-sm font-semibold text-ink">{inr(t.amount)}</p>
                </div>
                <p className="mt-1 text-sm text-espresso">
                  {t.from} → {t.to}
                </p>
                <p className="mt-2 text-xs text-espresso/80">
                  {day(t.at)} · {clock(t.at)} · Ref {t.ref}
                </p>
              </TagCard>
            );
          })}
        </div>
      )}
    </ModuleFrame>
  );
}
