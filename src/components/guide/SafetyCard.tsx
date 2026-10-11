import { ShieldAlert } from 'lucide-react';
import { useGuide } from '../../hooks/useGuide';
import { EMERGENCY } from '../../engines/planner';
import type { Trip } from '../../types';

const slug = (country: string) => country.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

/** Emergency numbers, nearest hospital and pharmacy, and official travel advice for the destination. */
export function SafetyCard({ trip }: { trip: Trip }) {
  const { guide } = useGuide(trip);
  if (!guide) return null;
  const d = guide.destination;
  const n = EMERGENCY[d.country] ?? { all: '112' };
  const near = (what: string) => `https://www.google.com/maps/search/${what}/@${d.lat},${d.lon},14z`;
  const numbers = [n.all && ['Emergency', n.all], n.police && ['Police', n.police], n.ambulance && ['Ambulance', n.ambulance]].filter(Boolean) as [string, string][];
  return (
    <section className="px-gutter pt-6">
      <div className="rounded-md border border-line bg-paper px-4 py-3 text-sm">
        <h2 className="flex items-center gap-2 font-medium text-ink">
          <ShieldAlert size={16} /> Safety in {d.name}
        </h2>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {numbers.map(([label, num]) => (
            <a key={label} href={`tel:${num}`} className="text-ink underline underline-offset-4">
              {label} {num}
            </a>
          ))}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <a href={near('hospital')} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            Nearest hospital
          </a>
          <a href={near('pharmacy')} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            Nearest pharmacy
          </a>
          {!d.isDomestic && (
            <>
              <a href={`https://www.gov.uk/foreign-travel-advice/${slug(d.country)}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                Official travel advice
              </a>
              <a href="https://www.mea.gov.in/" target="_blank" rel="noreferrer" className="underline underline-offset-4">
                India's Ministry of External Affairs
              </a>
            </>
          )}
        </p>
      </div>
    </section>
  );
}
