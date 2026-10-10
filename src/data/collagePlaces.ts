import type { Pastel } from '../design/tokens';

// Placeholder "photos" for the welcome collage: a landmark emoji on a pastel square.
// Swap for real photos later by adding an image path here.
export interface CollagePlace {
  emoji: string;
  place: string;
  country: string;
  pastel: Pastel;
}

export const collagePlaces: CollagePlace[] = [
  { emoji: '🗼', place: 'Paris', country: 'France', pastel: 'rose' },
  { emoji: '🕌', place: 'Agra', country: 'India', pastel: 'butter' },
  { emoji: '🗻', place: 'Mt Fuji', country: 'Japan', pastel: 'sky' },
  { emoji: '🗽', place: 'New York', country: 'USA', pastel: 'mint' },
  { emoji: '🏛️', place: 'Athens', country: 'Greece', pastel: 'lavender' },
  { emoji: '🐫', place: 'Giza', country: 'Egypt', pastel: 'peach' },
  { emoji: '🎡', place: 'London', country: 'UK', pastel: 'sky' },
  { emoji: '🏝️', place: 'Malé', country: 'Maldives', pastel: 'mint' },
  { emoji: '🌷', place: 'Amsterdam', country: 'Netherlands', pastel: 'rose' },
  { emoji: '🦘', place: 'Sydney', country: 'Australia', pastel: 'peach' },
  { emoji: '⛩️', place: 'Kyoto', country: 'Japan', pastel: 'butter' },
  { emoji: '🏔️', place: 'Zermatt', country: 'Switzerland', pastel: 'lavender' },
  { emoji: '🐘', place: 'Jaipur', country: 'India', pastel: 'peach' },
  { emoji: '🌴', place: 'Bali', country: 'Indonesia', pastel: 'mint' },
  { emoji: '🏟️', place: 'Rome', country: 'Italy', pastel: 'butter' },
  { emoji: '🦁', place: 'Serengeti', country: 'Tanzania', pastel: 'peach' },
  { emoji: '🌆', place: 'Dubai', country: 'UAE', pastel: 'sky' },
  { emoji: '🍁', place: 'Banff', country: 'Canada', pastel: 'rose' },
  { emoji: '🗿', place: 'Rapa Nui', country: 'Chile', pastel: 'lavender' },
  { emoji: '🛶', place: 'Alleppey', country: 'India', pastel: 'mint' },
  { emoji: '🏰', place: 'Bavaria', country: 'Germany', pastel: 'sky' },
];
