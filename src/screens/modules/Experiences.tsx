import { Clock, MapPin } from 'lucide-react';
import { ModuleFrame } from './ModuleFrame';
import { StampCard } from '../../components/cards/StampCard';
import type { Pastel } from '../../design/tokens';
import { inr } from '../../utils/format';

const pastels: Pastel[] = ['rose', 'lavender', 'mint', 'butter'];

export default function Experiences() {
  return (
    <ModuleFrame module="experiences" title="Experiences" sub="Picked for a slow explorer.">
      {({ experiences }) => (
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 pt-1">
          {experiences.map((e, i) => (
            <StampCard key={e.id} pastel={pastels[i % pastels.length]} tilt={i % 2 ? 1.5 : -1.5} className="h-full">
              <p className="font-display text-lg leading-tight text-ink">{e.title}</p>
              <p className="mt-2 flex items-center gap-1 text-xs text-espresso">
                <MapPin size={12} /> {e.area}
              </p>
              <p className="flex items-center gap-1 text-xs text-espresso">
                <Clock size={12} /> {e.duration}
              </p>
              <p className="mt-2 font-semibold text-ink">{e.amount ? inr(e.amount) : 'Free'}</p>
              <p className="mt-1 text-[0.625rem] font-semibold uppercase tracking-widest text-espresso/80">{e.tag}</p>
            </StampCard>
          ))}
        </div>
      )}
    </ModuleFrame>
  );
}
