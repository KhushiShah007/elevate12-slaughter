import { useEffect, useState } from 'react';
import { api } from '../api/client';

// The destination catalogue from /api/destinations, kept on the device so it also
// works offline. Refreshed in the background once per app session.

export interface DestinationSummary {
  id: number;
  slug: string;
  name: string;
  country: string;
  region: string;
  isDomestic: boolean;
  airportIata: string | null;
  bestTime: string | null;
  idealDays: number | null;
  tags: string[];
  personaTags: string[];
  dailyCostInr: { shoestring: number; moderate: number; comfort: number; luxury: number } | null;
  featured: boolean;
  imageUrl: string | null;
  imageThumbUrl: string | null;
  imageCredit: string | null;
}

const KEY = 'voyage.destinations';
let inflight: Promise<DestinationSummary[]> | null = null;

function cached(): DestinationSummary[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DestinationSummary[]) : null;
  } catch {
    return null;
  }
}

export function loadDestinations(): Promise<DestinationSummary[]> {
  inflight ??= api<{ destinations: DestinationSummary[] }>('GET', '/destinations')
    .then(({ destinations }) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(destinations));
      } catch {
        /* storage full or blocked */
      }
      return destinations;
    })
    .catch((err) => {
      inflight = null;
      const c = cached();
      if (c) return c;
      throw err;
    });
  return inflight;
}

/** All destinations (cached copy first, then fresh). Empty list while nothing is known yet. */
export function useDestinations() {
  const [list, setList] = useState<DestinationSummary[]>(() => cached() ?? []);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadDestinations()
      .then((d) => alive && setList(d))
      .catch(() => alive && setError('Could not load destinations. Check your connection.'));
    return () => {
      alive = false;
    };
  }, []);
  return { destinations: list, error };
}

/** Exact (case-insensitive) match on the destination name, if the text names one. */
export function matchDestination(list: DestinationSummary[], text: string) {
  const t = text.trim().toLowerCase();
  return list.find((d) => d.name.toLowerCase() === t) ?? null;
}
