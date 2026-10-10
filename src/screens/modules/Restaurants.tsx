import { Leaf, MapPin } from 'lucide-react';
import { ModuleFrame } from './ModuleFrame';
import { TagCard } from '../../components/cards/TagCard';
import { Chip } from '../../components/ui/Chip';
import { usePersona } from '../../hooks/usePersona';
import { orderRestaurants } from '../../engines/persona';
import { useT } from '../../i18n';

export default function Restaurants() {
  const p = usePersona();
  const { t } = useT();
  const vegFirst = p?.persona.vegFirst ?? false;

  return (
    <ModuleFrame module="restaurants" title="Restaurants & Cafes" sub={vegFirst ? t('effect.veg') : undefined}>
      {({ restaurants }) => (
        <div className="space-y-3">
          {(p ? orderRestaurants(restaurants, p.persona) : restaurants).map((r, i) => (
            <TagCard key={r.id} pastel={i % 2 ? 'butter' : 'peach'} side={<span className="font-display text-sm text-ink">{'₹'.repeat(r.priceLevel)}</span>}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-lg leading-tight text-ink">{r.name}</p>
                {r.veg ? (
                  <Chip tone="ok" icon={<Leaf size={11} />}>
                    Veg
                  </Chip>
                ) : (
                  vegFirst && (
                    <Chip tone="warn" dot>
                      {t('food.notVeg')}
                    </Chip>
                  )
                )}
              </div>
              <p className="mt-1 text-sm text-espresso">{r.cuisine}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-espresso/80">
                <MapPin size={12} /> {r.area}
              </p>
              <p className="mt-2 text-xs italic text-espresso">{r.note}</p>
              {p?.persona.jain && r.veg && <p className="mt-1 text-xs font-medium text-ink">🌱 {t('food.jainNote')}</p>}
            </TagCard>
          ))}
        </div>
      )}
    </ModuleFrame>
  );
}
