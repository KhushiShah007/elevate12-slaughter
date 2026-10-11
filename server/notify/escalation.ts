// Escalation rules for reminders, as plain functions (tested without a database).
// Critical reminders climb a ladder until the traveller taps Acknowledge:
//   step 0: in-app + push (+ email if allowed) → step 1: WhatsApp or SMS → step 2–3: automated call (max 2).
// Each step waits 30 minutes for an acknowledgement, less when the leave-by time is close.
// Ordinary notifications are one step: in-app + push (+ email).

export type NotifyChannel = 'push' | 'email' | 'sms' | 'whatsapp' | 'voice';

export interface Prefs {
  channels: Partial<Record<NotifyChannel, boolean>>;
  phone: string | null;
  email: string | null;
  timezone: string;
  quietStart: number; // minutes after local midnight
  quietEnd: number;
  dailyCapInr: number;
  smsStopped: boolean;
}

export interface NotificationState {
  critical: boolean;
  step: number;
  callAttempts: number;
  leaveBy: Date | null;
  fast: boolean;
}

/** Rough per-message cost, for the daily cap. */
export const COST_INR: Record<NotifyChannel, number> = { push: 0, email: 0, sms: 0.25, whatsapp: 0.8, voice: 3 };
export const MAX_CALLS = 2;
const MIN = 60_000;

export const defaultPrefs = (): Prefs => ({ channels: {}, phone: null, email: null, timezone: 'Asia/Kolkata', quietStart: 22 * 60, quietEnd: 7 * 60, dailyCapInr: 20, smsStopped: false });

/** Minutes after local midnight in the traveller's time zone. */
export function localMinutes(now: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return h * 60 + m;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

export function inQuietHours(now: Date, p: Pick<Prefs, 'timezone' | 'quietStart' | 'quietEnd'>) {
  if (p.quietStart === p.quietEnd) return false;
  const m = localMinutes(now, p.timezone);
  return p.quietStart > p.quietEnd ? m >= p.quietStart || m < p.quietEnd : m >= p.quietStart && m < p.quietEnd;
}

/** When quiet hours end (for deferring ordinary notifications). */
export function quietEndsAt(now: Date, p: Pick<Prefs, 'timezone' | 'quietEnd'>) {
  const m = localMinutes(now, p.timezone);
  const wait = (p.quietEnd - m + 24 * 60) % (24 * 60) || 24 * 60;
  return new Date(now.getTime() + wait * MIN);
}

/** How long to wait for an acknowledgement before the next step. */
export function ackWindowMs(now: Date, n: Pick<NotificationState, 'leaveBy' | 'fast'>) {
  if (n.fast) return MIN;
  if (!n.leaveBy) return 30 * MIN;
  const left = n.leaveBy.getTime() - now.getTime();
  return Math.min(30 * MIN, Math.max(5 * MIN, Math.round(left / 3)));
}

/** The channels tried at each step of the ladder. */
export function ladder(critical: boolean): NotifyChannel[][] {
  return critical ? [['push', 'email'], ['whatsapp', 'sms'], ['voice'], ['voice']] : [['push', 'email']];
}

export interface StepPlan {
  sends: { channel: NotifyChannel; to: string; costInr: number }[];
  skips: { channel: NotifyChannel; reason: 'consent' | 'quiet' | 'cap' | 'stopped' | 'no_address' | 'call_limit' }[];
  /** Run this step again later instead (ordinary notification in quiet hours). */
  deferUntil: Date | null;
  /** The next step and when, or null when the ladder is finished. */
  next: { step: number; at: Date } | null;
}

/** What to do for the notification's current step. `spentTodayInr` counts paid sends today. */
export function planStep(n: NotificationState, prefs: Prefs, now: Date, spentTodayInr: number): StepPlan {
  const steps = ladder(n.critical);
  const quiet = inQuietHours(now, prefs);
  if (!n.critical && quiet) return { sends: [], skips: [], deferUntil: quietEndsAt(now, prefs), next: null };

  const plan: StepPlan = { sends: [], skips: [], deferUntil: null, next: null };
  let spent = spentTodayInr;
  const channels = steps[n.step] ?? [];
  for (const channel of channels) {
    if (!prefs.channels[channel]) {
      plan.skips.push({ channel, reason: 'consent' });
      continue;
    }
    const to = channel === 'email' ? prefs.email : channel === 'push' ? 'this device' : prefs.phone;
    if (!to) {
      plan.skips.push({ channel, reason: 'no_address' });
      continue;
    }
    if ((channel === 'sms' || channel === 'whatsapp') && prefs.smsStopped) {
      plan.skips.push({ channel, reason: 'stopped' });
      continue;
    }
    if (channel === 'voice') {
      if (n.callAttempts >= MAX_CALLS) {
        plan.skips.push({ channel, reason: 'call_limit' });
        continue;
      }
      if (quiet) {
        plan.skips.push({ channel, reason: 'quiet' });
        continue;
      }
    }
    if (spent + COST_INR[channel] > prefs.dailyCapInr) {
      plan.skips.push({ channel, reason: 'cap' });
      continue;
    }
    spent += COST_INR[channel];
    plan.sends.push({ channel, to, costInr: COST_INR[channel] });
    if (channel === 'whatsapp') break; // one messaging channel per step: WhatsApp first, SMS if not allowed
  }
  if (n.critical && n.step + 1 < steps.length) plan.next = { step: n.step + 1, at: new Date(now.getTime() + ackWindowMs(now, n)) };
  return plan;
}
