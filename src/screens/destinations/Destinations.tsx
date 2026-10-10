import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Segmented } from '../../components/ui/Segmented';
import { Polaroid } from '../../components/cards/Polaroid';
import { useDestinations, type DestinationSummary } from '../../hooks/useDestinations';
import { destinationPhoto } from '../../data/photos';
import { usePersona } from '../../hooks/usePersona';
import { destinationFit, type Persona } from '../../engines/persona';
import { num } from '../../utils/format';
import type { Pastel } from '../../design/tokens';

const pastels: Pastel[] = ['peach', 'sky', 'mint', 'butter', 'lavender', 'rose'];

/** Destinations that suit the traveller's persona float up; otherwise featured first. */
function score(d: DestinationSummary, persona: Persona | undefined) {
  return (persona ? destinationFit(d.personaTags, persona) * 2 : 0) + (d.featured ? 1 : 0);
}

export default function Destinations() {
  const { destinations, error } = useDestinations();
  const persona = usePersona();
  const [q, setQ] = useState('');
  const [where, setWhere] = useState<'all' | 'india' | 'abroad'>('all');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return destinations
      .filter((d) => (where === 'all' ? true : where === 'india' ? d.isDomestic : !d.isDomestic))
      .filter((d) => !needle || [d.name, d.country, d.region, ...d.tags].some((v) => v.toLowerCase().includes(needle)))
      .sort((a, b) => score(b, persona?.fromQuiz ? persona.persona : undefined) - score(a, persona?.fromQuiz ? persona.persona : undefined) || a.name.localeCompare(b.name));
  }, [destinations, q, where, persona]);

  return (
    <div>
      <PageHeader back title="Explore" sub={`${destinations.length || 53} places, with real photos, weather and costs.`} source="cloud" />
      <div className="space-y-4 px-gutter">
        <label className="flex min-h-tap items-center gap-2 rounded-md border border-line bg-paper px-4 focus-within:border-ink">
          <Search size={18} className="text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search: beach, Kerala, Japan…"
            aria-label="Search destinations"
            className="min-h-tap w-full bg-transparent text-base text-ink outline-none placeholder:text-muted/70"
          />
        </label>
        <Segmented
          value={where}
          onChange={setWhere}
          options={[
            { value: 'all', label: 'All' },
            { value: 'india', label: 'India' },
            { value: 'abroad', label: 'Abroad' },
          ]}
        />
        {persona?.fromQuiz && !q && <p className="text-xs text-muted">Places that suit a {persona.persona.emoji} traveller like you come first.</p>}
        {error && !destinations.length && <p className="text-sm text-bad">{error}</p>}

        <div className="grid grid-cols-2 gap-x-4 gap-y-6 pb-6 pt-2">
          {list.map((d, i) => {
            const photo = destinationPhoto(d.slug);
            return (
              <Link key={d.slug} to={`/destinations/${d.slug}`} className="block">
                <Polaroid
                  pastel={pastels[i % pastels.length]}
                  caption={d.name}
                  sub={d.dailyCostInr ? `${d.country} · from ₹${num(d.dailyCostInr.shoestring)}/day` : d.country}
                  image={photo ? { src: photo.src, alt: d.name } : d.imageThumbUrl ? { src: d.imageThumbUrl, alt: d.name } : undefined}
                  tilt={i % 2 ? 1.5 : -1.5}
                  className="w-full"
                />
              </Link>
            );
          })}
        </div>
        {!list.length && destinations.length > 0 && <p className="pb-8 text-center text-sm text-muted">Nothing matches “{q}”. Try a city, country or “beach”.</p>}
      </div>
    </div>
  );
}
