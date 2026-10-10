import type { Intent } from '../../api/_guard';
import type { Language } from '../state/settings';

// On-device understanding: keyword rules, no AI, works offline. Handles English, Hinglish
// (Roman Hindi) and the native scripts that voice typing returns for hi/mr/ta/bn.

export interface IntentMatch {
  intent: Intent;
  minutes: number | null;
  score: number; // 0 = nothing matched; >= CONFIDENT_SCORE = sure enough to act on
}

export const CONFIDENT_SCORE = 2;

// Weight 3 = decisive phrase, 2 = strong word, 1 = hint.
const RULES: { intent: Intent; weight: number; words: string[] }[] = [
  { intent: 'missed', weight: 3, words: ['missed', 'miss ho', 'miss kar', 'chhoot', 'chhut', 'chut gayi', 'nikal gayi', 'छूट', 'छुट', 'चुकली', 'चुकला', 'தவற', 'মিস', 'ছুটে গেছে'] },
  { intent: 'delay', weight: 2, words: ['late', 'delay', 'delayed', 'der ho', 'der se', 'deri', 'लेट', 'देर', 'देरी', 'उशीर', 'उशिरा', 'தாமத', 'দেরি', 'দেরী', 'লেট'] },
  { intent: 'preponed', weight: 2, words: ['prepone', 'preponed', 'earlier', 'pehle ho', 'jaldi', 'पहले हो', 'जल्दी', 'लवकर', 'முன்னதாக', 'এগিয়ে'] },
  { intent: 'connecting', weight: 2, words: ['connecting', 'connection', 'transfer', 'change planes', 'कनेक्शन', 'कनेक्टिंग', 'இணைப்பு', 'কানেক্ট', 'কানেকশন'] },
  { intent: 'layover', weight: 3, words: ['layover', 'lay over', 'stopover', 'लेओवर', 'ले ओवर', 'लेओव्हर', 'இடைநிறுத்த', 'লেওভার'] },
  { intent: 'boardingPass', weight: 3, words: ['boarding pass', 'boarding', 'बोर्डिंग', 'போர்டிங்', 'বোর্ডিং'] },
  { intent: 'documents', weight: 2, words: ['passport', 'visa', 'document', 'wallet', 'ticket', 'पासपोर्ट', 'वीज़ा', 'वीजा', 'दस्तावेज', 'कागदपत्र', 'பாஸ்போர்ட்', 'ஆவண', 'পাসপোর্ট', 'নথি'] },
  { intent: 'nextFlight', weight: 2, words: ['next flight', 'my flight', 'flight kab', 'flight status', 'when is my flight', 'kitne baje', 'अगली फ़्लाइट', 'अगली फ्लाइट', 'फ्लाइट कब', 'पुढची फ्लाइट', 'அடுத்த விமான', 'পরের ফ্লাইট'] },
  { intent: 'family', weight: 2, words: ['family', 'pickup', 'pick up', 'mummy', 'papa', 'mom', 'dad', 'ghar wale', 'share', 'परिवार', 'घरवाले', 'पिकअप', 'कुटुंब', 'குடும்ப', 'পরিবার'] },
  { intent: 'budget', weight: 2, words: ['budget', 'cost', 'kharcha', 'kharch', 'spend', 'spent', 'paisa', 'paise', 'खर्च', 'ख़र्च', 'बजट', 'செலவு', 'খরচ'] },
  { intent: 'hotel', weight: 2, words: ['hotel', 'stay', 'room', 'check in', 'ryokan', 'होटल', 'ठहर', 'मुक्काम', 'ஹோட்டல்', 'தங்கு', 'হোটেল'] },
  { intent: 'food', weight: 2, words: ['food', 'eat', 'restaurant', 'veg', 'khana', 'khaana', 'breakfast', 'lunch', 'dinner', 'खाना', 'भोजन', 'जेवण', 'உணவ', 'சாப்பா', 'খাবার'] },
  { intent: 'itinerary', weight: 2, words: ['itinerary', 'plan', 'schedule', 'programme', 'योजना', 'दिनक्रम', 'திட்டம்', 'পরিকল্পনা'] },
  { intent: 'itinerary', weight: 1, words: ['today', 'tomorrow', 'aaj', 'kal', 'आज', 'कल'] },
  { intent: 'points', weight: 3, words: ['points', 'point', 'loyalty', 'reward', 'अंक', 'पॉइंट', 'गुण', 'புள்ளி', 'পয়েন্ট'] },
];

// When scores tie, the more urgent problem wins.
const PRIORITY: Intent[] = ['missed', 'delay', 'preponed', 'connecting', 'layover', 'boardingPass', 'nextFlight', 'family', 'documents', 'budget', 'hotel', 'food', 'itinerary', 'points'];

const INDIC_DIGITS: [RegExp, number][] = [
  [/[०-९]/g, 0x0966],
  [/[০-৯]/g, 0x09e6],
  [/[௦-௯]/g, 0x0be6],
];

/** Lower-case, Indian digits to 0-9, punctuation to spaces. */
export function normalise(text: string): string {
  let s = text.normalize('NFC').toLowerCase();
  for (const [re, zero] of INDIC_DIGITS) s = s.replace(re, (d) => String(d.charCodeAt(0) - zero));
  return ` ${s.replace(/[^\p{L}\p{M}\p{N}.]+/gu, ' ').replace(/\s+/g, ' ').trim()} `;
}

const isLatin = (w: string) => /^[a-z .]+$/.test(w);

function has(norm: string, word: string): boolean {
  // Latin words need word edges ("late" must not match "plate"); Indian scripts match inside words.
  return isLatin(word) ? new RegExp(`(^|\\s)${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`).test(norm) : norm.includes(word);
}

const HOURS = '(?:h|hr|hrs|hour|hours|ghanta|ghante|ghanton|ghante ki|घंटा|घंटे|घंटों|तास|மணி|ঘণ্টা|ঘন্টা)';
const MINS = '(?:m|min|mins|minute|minutes|minat|मिनट|मिनिट|मिनिटे|நிமிட|মিনিট)';

/** How many minutes the message mentions, e.g. "2 ghante 30 min", "डेढ़ घंटा", "90 min". */
export function parseMinutes(text: string): number | null {
  const s = normalise(text);
  let total = 0;
  const h = s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${HOURS}`, 'u'));
  if (h) total += Math.round(parseFloat(h[1]) * 60);
  const m = s.match(new RegExp(`(\\d+)\\s*${MINS}(?![a-z])`, 'u'));
  if (m) total += parseInt(m[1], 10);
  if (!total) {
    const words: [RegExp, number][] = [
      [/(dedh|derh|डेढ़|डेढ)/u, 90],
      [/(dhai|ढाई)/u, 150],
      [/(aadha|adha|आधा|half an hour|half hour)/u, 30],
      [/(ek|एक|one|an) (ghanta|hour|घंटा)/u, 60],
      [/(do|दो|two) (ghante|hours|घंटे)/u, 120],
      [/(teen|तीन|three) (ghante|hours|घंटे)/u, 180],
    ];
    for (const [re, min] of words) if (re.test(s)) return min;
  }
  return total > 0 && total <= 1440 ? total : null;
}

export function matchIntent(text: string): IntentMatch {
  const norm = normalise(text);
  const scores = new Map<Intent, number>();
  for (const rule of RULES) {
    if (rule.words.some((w) => has(norm, w))) scores.set(rule.intent, (scores.get(rule.intent) ?? 0) + rule.weight);
  }
  const minutes = parseMinutes(text);
  // "2 hours late" is a delay even if only the number gave it away.
  if (minutes && !scores.has('preponed')) scores.set('delay', (scores.get('delay') ?? 0) + 1);

  let best: Intent = 'unknown';
  let score = 0;
  for (const intent of PRIORITY) {
    const s = scores.get(intent) ?? 0;
    if (s > score) {
      best = intent;
      score = s;
    }
  }
  return { intent: best, minutes, score };
}

/** "Hindi mein baat karo", "switch to Tamil", "मराठीत बोला": a request to change language. */
export function languageRequest(text: string): Language | null {
  const s = normalise(text);
  const triggers = ['mein', 'me', 'in', 'to', 'language', 'bhasha', 'switch', 'speak', 'bolo', 'baat', 'में', 'मध्ये', 'भाषा', 'बोलो', 'बोला', 'बात', 'मराठीत', 'மொழி', 'ভাষা'];
  if (!triggers.some((w) => has(s, w))) return null;
  const names: [RegExp, Language][] = [
    [/hinglish/u, 'hinglish'],
    [/(hindi|हिंदी|हिन्दी)/u, 'hi'],
    [/(marathi|मराठी)/u, 'mr'],
    [/(tamil|தமிழ்)/u, 'ta'],
    [/(bengali|bangla|বাংলা)/u, 'bn'],
    [/(english|अंग्रेज़ी|अंग्रेजी|इंग्रजी)/u, 'en'],
  ];
  for (const [re, lang] of names) if (re.test(s)) return lang;
  return null;
}
