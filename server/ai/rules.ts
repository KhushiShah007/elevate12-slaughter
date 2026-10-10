import { getDb, schema as s } from '../db/client';
import { runTool, type ToolLink } from './tools';

// The assistant without an AI key: plain rules pick a tool, and fixed sentences explain
// what it returned. It never makes anything up, and the bot never "dies".

const has = (t: string, words: string[]) => words.some((w) => t.includes(w));
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

async function destinationIn(text: string) {
  const { db } = await getDb();
  const all = await db.select({ name: s.destinations.name }).from(s.destinations);
  const t = text.toLowerCase();
  return all.find((d) => t.includes(d.name.toLowerCase()))?.name ?? null;
}

export async function answerByRules(userId: string, message: string): Promise<{ reply: string; links: ToolLink[]; toolsUsed: string[] }> {
  const t = message.toLowerCase();
  const used: string[] = [];
  const call = async (name: string, args: object = {}) => {
    used.push(name);
    return runTool(userId, name, JSON.stringify(args));
  };

  // Feeling unwell, tired, rain, late: replan today.
  const mode = has(t, ['sick', 'unwell', 'fever', 'ill ', 'bimar', 'तबीयत', 'बीमार']) ? 'sick' : has(t, ['tired', 'exhausted', 'thak', 'थक']) ? 'tired' : has(t, ['lighter', 'easy day', 'relax today']) ? 'lighter' : has(t, ['raining', 'rain today', 'baarish', 'बारिश']) ? 'rain' : has(t, ['running late', 'late today', 'der ho gayi']) ? 'late' : null;
  if (mode) {
    const r = await call('replan_itinerary', { mode });
    const d = r.data as { error?: string; trip?: string; date?: string; changes?: string[]; emergency?: { numbers: { all?: string; ambulance?: string } } | null };
    if (d.error) return { reply: d.error, links: r.links, toolsUsed: used };
    const care = d.emergency ? ` If you need help, the emergency number there is ${d.emergency.numbers.all ?? d.emergency.numbers.ambulance}. The itinerary shows the nearest pharmacy and hospital.` : '';
    return { reply: `I have changed ${d.date} of ${d.trip}: ${(d.changes ?? []).join('; ')}.${care} You can undo this in the itinerary.`, links: r.links, toolsUsed: used };
  }

  if (has(t, ['cancel', 'refund', 'radd'])) {
    const what = message.replace(/.*?(cancel|refund)\s*(my|the)?\s*/i, '').trim();
    if (what.length < 2) return { reply: 'Which booking should I start cancelling? Say its name or PNR, for example "cancel Santana Beach Resort".', links: [], toolsUsed: used };
    const r = await call('start_cancellation', { booking: what });
    const d = r.data as { error?: string; booking?: string; refundEstimateInr?: number; feeInr?: number; days?: number; note?: string };
    if (d.error) return { reply: `${d.error} You can open any booking from its trip to cancel it.`, links: [], toolsUsed: used };
    return {
      reply: d.refundEstimateInr != null ? `For ${d.booking} you would get back about ${inr(d.refundEstimateInr)} (fee ${inr(d.feeInr ?? 0)}), in about ${d.days} days. Nothing is cancelled until you confirm.` : `${d.booking}: ${d.note}`,
      links: r.links,
      toolsUsed: used,
    };
  }

  if (has(t, ['flight status', 'status of', 'is my flight', 'delayed', 'on time'])) {
    const flight = message.match(/\b([A-Z0-9]{2})\s?-?(\d{2,4})\b/i);
    if (!flight) return { reply: 'Tell me the flight number, for example "status of 6E 5321".', links: [], toolsUsed: used };
    const r = await call('flight_status', { flight: `${flight[1]} ${flight[2]}` });
    const d = r.data as { error?: string; flight?: string; scheduledDeparture?: string; status?: string; note?: string };
    return { reply: d.error ? `${d.error} ${d.note}` : `${d.flight} is ${d.status}, departing ${d.scheduledDeparture?.replace('T', ' ').slice(0, 16)}. ${d.note}`, links: r.links, toolsUsed: used };
  }

  if (has(t, ['budget', 'spent', 'kharcha', 'kitna', 'cost of my trip', 'खर्च'])) {
    const r = await call('trip_budget');
    const d = r.data as { error?: string; trip?: string; budgetInr?: number | null; bookedInr?: number; savedOptionsInr?: number; spentInr?: number; refundedInr?: number };
    if (d.error) return { reply: d.error, links: [], toolsUsed: used };
    return {
      reply: `${d.trip}: budget ${d.budgetInr ? inr(d.budgetInr) : 'not set'}, booked ${inr(d.bookedInr ?? 0)}, saved options ${inr(d.savedOptionsInr ?? 0)}, spent on the trip ${inr(d.spentInr ?? 0)}${d.refundedInr ? `, refunded ${inr(d.refundedInr)}` : ''}.`,
      links: r.links,
      toolsUsed: used,
    };
  }

  const place = await destinationIn(message);
  if (place && has(t, ['weather', 'mausam', 'rain', 'temperature', 'मौसम'])) {
    const r = await call('get_weather', { destination: place });
    const d = r.data as { error?: string; place?: string; now?: { tempC: number; summary: string }; days?: { maxC: number; minC: number }[]; source?: string };
    if (d.error || !d.now) return { reply: d.error ?? 'Weather is not available right now.', links: r.links, toolsUsed: used };
    return { reply: `${d.place} now: ${d.now.tempC}°C, ${d.now.summary.toLowerCase()}. Next days ${Math.min(...d.days!.map((x) => x.minC))}–${Math.max(...d.days!.map((x) => x.maxC))}°C (${d.source}).`, links: r.links, toolsUsed: used };
  }
  if (place) {
    const r = await call('get_destination', { name: place });
    const d = r.data as { name: string; bestTime: string | null; idealDays: number | null; dailyCostPerPersonInr: { moderate: number } | null; placesToSee: { name: string }[] };
    return {
      reply: `${d.name}: best time ${d.bestTime ?? 'any time'}, ${d.idealDays ?? 3} days is ideal, about ${d.dailyCostPerPersonInr ? inr(d.dailyCostPerPersonInr.moderate) : '—'} per person a day on a moderate budget. Worth seeing: ${d.placesToSee.slice(0, 3).map((p) => p.name).join(', ')}.`,
      links: r.links,
      toolsUsed: used,
    };
  }

  if (has(t, ['where can i go', 'suggest', 'recommend', 'kahan ja', 'weekend'])) {
    const r = await call('suggest_destinations', { tag: has(t, ['beach']) ? 'beach' : has(t, ['mountain', 'hill', 'nature']) ? 'nature' : has(t, ['cheap', 'budget', 'sasta']) ? 'budget' : '', domestic: has(t, ['abroad', 'international']) ? false : has(t, ['india']) ? true : undefined });
    const d = r.data as { destinations: { name: string; bestTime: string | null }[] };
    return { reply: d.destinations.length ? `Some ideas: ${d.destinations.slice(0, 4).map((x) => `${x.name} (best ${x.bestTime ?? 'any time'})`).join(', ')}. For a budget, try "Where can I go?" on Home.` : 'Try "Where can I go?" on Home with your budget.', links: r.links, toolsUsed: used };
  }

  if (has(t, ['document', 'passport', 'visa', 'aadhaar', 'expire'])) {
    const r = await call('list_my_documents');
    const d = r.data as { today: string; documents: { title: string; expires: string | null }[] };
    const soon = d.documents.filter((x) => x.expires && x.expires <= new Date(Date.parse(d.today) + 180 * 86_400_000).toISOString().slice(0, 10));
    return { reply: d.documents.length ? `You have ${d.documents.length} saved document${d.documents.length === 1 ? '' : 's'}.${soon.length ? ` Expiring within 6 months: ${soon.map((x) => `${x.title} (${x.expires})`).join(', ')}.` : ' None expire in the next 6 months.'}` : 'No documents saved on your account yet. Add them in the Wallet.', links: r.links, toolsUsed: used };
  }

  if (has(t, ['trip', 'plan', 'yatra', 'safar'])) {
    const r = await call('list_my_trips');
    const d = r.data as { trips: { title: string; startDate: string; endDate: string; travellers: number }[] };
    return { reply: d.trips.length ? `Your trips: ${d.trips.map((x) => `${x.title} (${x.startDate} to ${x.endDate}, ${x.travellers} ${x.travellers === 1 ? 'person' : 'people'})`).join('; ')}.` : 'No trips yet. Tap New trip on Home to plan one.', links: r.links, toolsUsed: used };
  }

  return {
    reply: 'I can help with your trips, budget, weather, destinations, documents, cancellations and refunds, flight status, or replanning a day ("I feel sick today"). What would you like?',
    links: [],
    toolsUsed: used,
  };
}
