import type { QuizQuestion } from '../data/quizQuestions';

// Plain rules that turn quiz answers into a persona and the settings it changes.
// "Other" answers (typed by the traveller) are matched to the nearest option by keywords.

export type QuestionId = QuizQuestion['id'];
export type Answers = Partial<Record<QuestionId, string>>; // option value, or 'other'
export type Notes = Partial<Record<QuestionId, string>>; // typed text for 'other'

export type PersonaId = 'family' | 'slow' | 'foodie' | 'culture' | 'nature' | 'planner' | 'saver' | 'easy';

export interface Persona {
  id: PersonaId;
  emoji: string;
  /** Rupees an hour of trip time is worth when ranking recovery options. */
  valueOfHourInr: number;
  /** How many things a day the itinerary plans. */
  activitiesPerDay: number;
  vegFirst: boolean;
  jain: boolean;
  /** Elders or kids along: offer bigger text. */
  suggestSenior: boolean;
  interests: string[];
  /** The answers actually used, after "Other" was matched (for showing what changed). */
  resolved: Answers;
}

// Keywords for matching typed "Other" answers. English plus common Hinglish.
const OTHER_KEYWORDS: Record<QuestionId, Record<string, string[]>> = {
  style: {
    planner: ['plan', 'planned', 'schedule', 'organis', 'organiz', 'itinerary', 'list'],
    flexible: ['flexible', 'flow', 'relax', 'loose', 'mix of'],
    spontaneous: ['spontaneous', 'random', 'last minute', 'impulse', 'jo mann', 'dekhte hain'],
  },
  interests: {
    culture: ['temple', 'museum', 'history', 'heritage', 'art', 'culture', 'mandir', 'architecture', 'festival'],
    food: ['food', 'eat', 'cafe', 'coffee', 'street food', 'khana', 'cuisine', 'dessert'],
    nature: ['beach', 'mountain', 'hill', 'trek', 'hike', 'nature', 'garden', 'adventure', 'wildlife', 'pahad', 'sea'],
    shopping: ['shop', 'mall', 'market', 'nightlife', 'city', 'bazaar', 'clubs'],
  },
  pace: {
    slow: ['slow', 'relax', 'chill', 'rest', 'easy', 'aaram', 'leisure'],
    balanced: ['balance', 'some', 'moderate', 'medium'],
    packed: ['packed', 'everything', 'max', 'busy', 'see all', 'fast', 'sab kuch'],
  },
  budget: {
    saver: ['cheap', 'budget', 'save', 'saving', 'backpack', 'low', 'sasta', 'student', 'kam'],
    mid: ['comfort', 'moderate', 'mid', 'normal', 'value'],
    treat: ['luxury', 'splurge', 'premium', 'treat', '5 star', 'five star', 'business class'],
  },
  food: {
    jain: ['jain', 'no onion', 'no garlic', 'without onion'],
    veg: ['veg', 'vegetarian', 'vegan', 'no meat', 'eggetarian', 'shakahari', 'plant'],
    nonveg: ['non veg', 'non-veg', 'nonveg', 'chicken', 'fish', 'meat', 'anything', 'everything', 'all food'],
  },
  mix: {
    family: ['family', 'parents', 'kids', 'children', 'elders', 'grandparents', 'mummy', 'papa', 'ghar wale', 'parivaar', 'baby'],
    couple: ['partner', 'wife', 'husband', 'spouse', 'girlfriend', 'boyfriend', 'honeymoon'],
    solo: ['alone', 'solo', 'myself', 'akela', 'akele', 'just me'],
  },
};

// Order matters where keywords overlap ("non veg" must win over "veg"; "jain" over "veg").
const MATCH_ORDER: Partial<Record<QuestionId, string[]>> = { food: ['jain', 'nonveg', 'veg'] };

/** Best option for a typed "Other" answer, or null if nothing fits. */
export function matchOther(question: QuestionId, text: string): string | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9 -]+/g, ' ')} `;
  const table = OTHER_KEYWORDS[question];
  const order = MATCH_ORDER[question] ?? Object.keys(table);
  for (const option of order) {
    if (table[option].some((w) => t.includes(w))) return option;
  }
  return null;
}

/** Replace 'other' with the matched option where we can. */
export function resolveAnswers(answers: Answers, notes: Notes = {}): Answers {
  const out: Answers = {};
  for (const [q, v] of Object.entries(answers) as [QuestionId, string][]) {
    out[q] = v === 'other' ? (matchOther(q, notes[q] ?? '') ?? 'other') : v;
  }
  return out;
}

export function derivePersona(answers: Answers, notes: Notes = {}): Persona {
  const a = resolveAnswers(answers, notes);
  const id: PersonaId =
    a.mix === 'family'
      ? 'family'
      : a.pace === 'slow'
        ? 'slow'
        : a.interests === 'food'
          ? 'foodie'
          : a.interests === 'culture'
            ? 'culture'
            : a.interests === 'nature'
              ? 'nature'
              : a.style === 'planner'
                ? 'planner'
                : a.budget === 'saver'
                  ? 'saver'
                  : 'easy';

  const emoji: Record<PersonaId, string> = {
    family: '👨‍👩‍👧',
    slow: '☕',
    foodie: '🍜',
    culture: '🏯',
    nature: '🌿',
    planner: '🗂️',
    saver: '🪙',
    easy: '🧭',
  };

  return {
    id,
    emoji: emoji[id],
    valueOfHourInr: a.budget === 'saver' ? 300 : a.budget === 'treat' ? 1000 : 600,
    activitiesPerDay: a.pace === 'slow' || a.mix === 'family' ? 2 : a.pace === 'packed' ? 4 : 3,
    vegFirst: a.food === 'veg' || a.food === 'jain',
    jain: a.food === 'jain',
    suggestSenior: a.mix === 'family',
    interests: a.interests && a.interests !== 'other' ? [a.interests] : [],
    resolved: a,
  };
}

/** A neutral persona for travellers who skipped the quiz. */
export const defaultPersona = (): Persona => derivePersona({});

/** Experiences that match the persona's interests first; `match` says which ones. */
export function orderExperiences<T extends { interests?: string[] }>(items: T[], persona: Persona) {
  return items
    .map((item, index) => ({ item, index, match: !!item.interests?.some((i) => persona.interests.includes(i)) }))
    .sort((a, b) => Number(b.match) - Number(a.match) || a.index - b.index)
    .map(({ item, match }) => ({ item, match }));
}

/** Vegetarian places first for veg and Jain travellers; otherwise keep the order. */
export function orderRestaurants<T extends { veg: boolean }>(items: T[], persona: Persona): T[] {
  if (!persona.vegFirst) return items;
  return items.map((item, index) => ({ item, index })).sort((a, b) => Number(b.item.veg) - Number(a.item.veg) || a.index - b.index).map((x) => x.item);
}
