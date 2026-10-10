import { describe, expect, it } from 'vitest';
import { CONFIDENT_SCORE, languageRequest, matchIntent, parseMinutes } from '../intentMatcher';
import { planReply, type AssistantContext } from '../assistantPlan';

const intentOf = (s: string) => matchIntent(s).intent;

describe('on-device intent matching', () => {
  it.each([
    ['Meri flight 2 ghante late hai', 'delay'],
    ['my flight is delayed', 'delay'],
    ['मेरी फ्लाइट लेट है', 'delay'],
    ['माझी फ्लाइट उशिरा आहे', 'delay'],
    ['என் விமானம் தாமதம்', 'delay'],
    ['আমার ফ্লাইট দেরি', 'delay'],
    ['Meri connecting flight chhoot gayi', 'missed'],
    ['I missed my connection', 'missed'],
    ['Delhi mein layover pe kya karun?', 'layover'],
    ['show my boarding pass', 'boardingPass'],
    ['mera boarding pass dikhao', 'boardingPass'],
    ['where is my passport', 'documents'],
    ['flight pehle ho gayi', 'preponed'],
    ['kitne points hain', 'points'],
    ['veg khana kahan milega', 'food'],
  ])('%s -> %s', (text, intent) => {
    const m = matchIntent(text);
    expect(m.intent).toBe(intent);
    expect(m.score).toBeGreaterThanOrEqual(CONFIDENT_SCORE);
  });

  it('does not match "late" inside other words', () => {
    expect(intentOf('a plate of food')).toBe('food');
  });

  it('returns unknown for unrelated text', () => {
    expect(matchIntent('what is the meaning of life').intent).toBe('unknown');
  });

  it('is not confident from a single hint word', () => {
    expect(matchIntent('aaj mausam kaisa hai').score).toBeLessThan(CONFIDENT_SCORE);
    expect(matchIntent('show my plan for today').intent).toBe('itinerary');
  });
});

describe('minutes in a message', () => {
  it.each([
    ['2 ghante late', 120],
    ['delayed 90 min', 90],
    ['1.5 hours', 90],
    ['2 hours 30 minutes', 150],
    ['डेढ़ घंटा लेट', 90],
    ['२ घंटे देर', 120],
    ['aadha ghanta', 30],
    ['3 மணி நேரம்', 180],
  ])('%s -> %i', (text, min) => expect(parseMinutes(text)).toBe(min));

  it('ignores flight numbers and silly values', () => {
    expect(parseMinutes('AI 865 is late')).toBeNull();
    expect(parseMinutes('99 hours')).toBeNull();
  });
});

describe('language requests', () => {
  it('spots a request to switch language', () => {
    expect(languageRequest('Hindi mein baat karo')).toBe('hi');
    expect(languageRequest('switch to Tamil')).toBe('ta');
    expect(languageRequest('मराठीत बोला')).toBe('mr');
    expect(languageRequest('Hindi')).toBeNull(); // a bare word is not a request
  });
});

describe('reply plan', () => {
  const ctx: AssistantContext = {
    tripId: 't-japan',
    flightId: 'f1',
    flightNo: 'AI 865',
    departs: '06:10',
    risk: 'ok',
    hasConnection: true,
    boardingPassDocId: 'doc3',
    points: 7285,
  };

  it('offers to report a delay only when the minutes are known, and acts only on tap', () => {
    const p = planReply('delay', 120, ctx)!;
    expect(p.actions[0].report).toEqual({ kind: 'delay', flightId: 'f1', minutes: 120 });
    expect(planReply('delay', null, ctx)!.actions.every((a) => !a.report)).toBe(true);
  });

  it('sends connection questions to the delay screen on a direct flight', () => {
    expect(planReply('layover', null, { ...ctx, hasConnection: false })!.actions[0].to).toBe('/trips/t-japan/disruption/delay');
  });

  it('has no plan for unknown', () => {
    expect(planReply('unknown', null, ctx)).toBeNull();
  });
});
