// Single source of truth for the Voyage look. Tailwind reads from here;
// components use Tailwind classes and never hard-code a colour.

export const colors = {
  // Backgrounds: warm, never pure white
  ivory: '#F5EFE3',
  paper: '#FBF7EE',
  sand: '#E8DCC8',
  line: '#DCCBB2', // thin warm 1px borders

  // Text: dark only
  ink: '#1E1A17',
  espresso: '#3A2E27',
  muted: '#7A6F66',

  // Pastel widgets
  peach: '#F6D5C2',
  lavender: '#DCD3F0',
  mint: '#CFE6D6',
  butter: '#F5E6B3',
  sky: '#CFE3F0',
  rose: '#F2CFD6',

  // Status (muted, not neon)
  ok: '#5E8F6B',
  warn: '#C98A2B',
  bad: '#B5483A',

  // Passport foil accent
  gold: '#B08D57',
} as const;

export type ColorName = keyof typeof colors;
export type Pastel = 'peach' | 'lavender' | 'mint' | 'butter' | 'sky' | 'rose';

export const fonts = {
  display: ['Fraunces', 'Georgia', 'serif'],
  body: ['Inter', 'system-ui', 'sans-serif'],
} as const;

export const radii = {
  sm: '10px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  pill: '999px',
} as const;

export const sizes = {
  appWidth: '430px', // phone column on desktop
  tap: '48px', // min tap target
  tapSenior: '56px',
  gutter: '20px',
  nav: '72px',
} as const;

export const shadows = {
  card: '0 1px 0 rgba(58,46,39,0.05), 0 10px 24px -14px rgba(58,46,39,0.35)',
  lift: '0 2px 0 rgba(58,46,39,0.06), 0 18px 36px -18px rgba(58,46,39,0.45)',
} as const;

export const dropShadows = {
  stamp: '0 6px 10px rgba(58,46,39,0.18)',
} as const;

// Each module gets its own pastel so screens are easy to tell apart.
export const modulePastel = {
  flights: 'sky',
  documents: 'lavender',
  transportation: 'butter',
  accommodation: 'peach',
  budget: 'mint',
  experiences: 'rose',
  itinerary: 'lavender',
  restaurants: 'peach',
} as const satisfies Record<string, Pastel>;

// Tailwind needs full class names written out so it can find them.
export const pastelBg: Record<Pastel, string> = {
  peach: 'bg-peach',
  lavender: 'bg-lavender',
  mint: 'bg-mint',
  butter: 'bg-butter',
  sky: 'bg-sky',
  rose: 'bg-rose',
};

export const seniorTextScale = 1.25;
