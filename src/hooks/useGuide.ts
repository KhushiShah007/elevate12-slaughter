import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { loadDestinations } from './useDestinations';
import { usePersona } from './usePersona';
import { defaultPersona } from '../engines/persona';
import { budgetStyle, type BudgetStyle } from '../engines/personalize';
import type { Trip } from '../types';

// The city guide for a trip's destination (places to see and eat, with estimated costs
// and review links), priced for the traveller's budget style. Kept on the device so the
// trip screens still work offline.

export interface GuidePlace {
  id: number;
  name: string;
  kind: 'see' | 'eat';
  category: string | null;
  cuisine: string | null;
  vegetarian: boolean | null;
  lat: number | null;
  lon: number | null;
  openingHours: string | null;
  entry: 'free' | 'paid' | null;
  costRange: [number, number] | null;
  rating: number | null;
  ratingCount: number | null;
  reviewsUrl: string;
  mapUrl: string;
}

export interface Guide {
  destination: {
    slug: string;
    name: string;
    country: string;
    lat: number;
    lon: number;
    airportIata: string | null;
    dailyCostInr: Record<BudgetStyle, number> | null;
    isDomestic: boolean;
  };
  see: GuidePlace[];
  eat: GuidePlace[];
  ratingsFrom: 'google' | null;
  note: string;
}

const key = (slug: string, style: string) => `voyage.guide.${slug}.${style}`;

/** undefined while loading, null when the trip's destination is not in the catalogue. */
export function useGuide(trip: Trip | null | undefined) {
  const persona = usePersona();
  const style = budgetStyle(persona?.persona ?? defaultPersona());
  const [guide, setGuide] = useState<Guide | null | undefined>(undefined);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!trip) return;
    let alive = true;
    (async () => {
      const list = await loadDestinations().catch(() => []);
      const slug = trip.destinationSlug ?? list.find((d) => d.name.toLowerCase() === trip.to.toLowerCase())?.slug ?? null;
      if (!slug) return alive && setGuide(null);
      try {
        const cached = localStorage.getItem(key(slug, style));
        if (cached && alive) setGuide(JSON.parse(cached) as Guide);
      } catch {
        /* no cache */
      }
      try {
        const g = await api<Guide>('GET', `/destinations/${slug}/guide?style=${style}`, undefined, 30_000);
        if (!alive) return;
        setGuide(g);
        setOffline(false);
        try {
          localStorage.setItem(key(slug, style), JSON.stringify(g));
        } catch {
          /* storage full */
        }
      } catch {
        if (!alive) return;
        setOffline(true);
        setGuide((g) => g ?? null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [trip?.id, trip?.destinationSlug, trip?.to, style]);

  return { guide, style, offline };
}
