import manifest from './photos.json';
import type { Pastel } from '../design/tokens';

// Photos bundled with the app (public/img), written by data-pipeline/images.ts.
// Every photo is a freely licensed Wikimedia Commons file; credits are in photoCredits().

export interface Photo {
  src: string;
  credit: string;
  license: string;
  page: string;
}

export interface DestinationPhoto extends Photo {
  name: string;
  country: string;
  featured: boolean;
}

const destinations = manifest.destinations as unknown as Record<string, DestinationPhoto>;
const memories = manifest.memories as Record<string, Photo>;

export const destinationPhoto = (slug: string | null | undefined): DestinationPhoto | null => (slug ? (destinations[slug] ?? null) : null);
export const memoryPhoto = (key: string | undefined): Photo | null => (key ? (memories[key] ?? null) : null);

/** Find a destination photo by its name (for trips that only store the city name). */
export function photoForPlace(name: string | null | undefined): DestinationPhoto | null {
  const n = name?.trim().toLowerCase();
  if (!n) return null;
  return Object.values(destinations).find((d) => d.name.toLowerCase() === n) ?? null;
}

const pastels: Pastel[] = ['rose', 'butter', 'sky', 'mint', 'lavender', 'peach'];

/** Places for the welcome collage: featured destinations first, then the rest. */
export function collagePlaces(count = 21) {
  const all = Object.entries(destinations).sort(([, a], [, b]) => Number(b.featured) - Number(a.featured));
  return all.slice(0, count).map(([slug, d], i) => ({ slug, place: d.name, country: d.country, src: d.src, pastel: pastels[i % pastels.length] }));
}

export const destinationCount = Object.keys(destinations).length;

/** Every photo with its author and licence, for the credits screen. */
export function photoCredits() {
  return [
    ...Object.values(destinations).map((d) => ({ title: `${d.name}, ${d.country}`, ...d })),
    ...Object.entries(memories).map(([key, p]) => ({ title: key.replace(/-/g, ' '), ...p })),
  ];
}
