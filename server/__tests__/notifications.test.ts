// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';

process.env.PGLITE_DIR = 'memory';
process.env.SEED_LIGHT = '1';
delete process.env.ALLOW_REAL_OUTBOUND;
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
process.env.CRON_SECRET = 'cron-test-secret';

const { app } = await import('../app');
const { planStep, ackWindowMs, inQuietHours, defaultPrefs } = await import('../notify/escalation');
const { runDue } = await import('../notify/service');
const { twilioSignature } = await import('../routes/notifications');
const { getDb, schema } = await import('../db/client');
const { eq } = await import('drizzle-orm');

let cookie = '';
const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.request(`/api${path}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};

const MIN = 60_000;
const allOn = { ...defaultPrefs(), channels: { push: true, email: true, sms: true, whatsapp: false, voice: true }, phone: '+919820011111', email: 'a@b.c', quietStart: 0, quietEnd: 0 };
const crit = { critical: true, step: 0, callAttempts: 0, leaveBy: null, fast: false };

describe('escalation rules', () => {
  it('waits 30 minutes, less when leave-by is close, and climbs push → SMS → call', () => {
    const now = new Date('2026-10-11T08:00:00Z');
    expect(ackWindowMs(now, { leaveBy: null, fast: false })).toBe(30 * MIN);
    expect(ackWindowMs(now, { leaveBy: new Date(now.getTime() + 30 * MIN), fast: false })).toBe(10 * MIN);
    expect(ackWindowMs(now, { leaveBy: new Date(now.getTime() + 5 * MIN), fast: false })).toBe(5 * MIN);
    const s0 = planStep(crit, allOn, now, 0);
    expect(s0.sends.map((x) => x.channel)).toEqual(['push', 'email']);
    expect(s0.next!.at.getTime() - now.getTime()).toBe(30 * MIN);
    expect(planStep({ ...crit, step: 1 }, allOn, now, 0).sends.map((x) => x.channel)).toEqual(['sms']);
    expect(planStep({ ...crit, step: 2 }, allOn, now, 0).sends.map((x) => x.channel)).toEqual(['voice']);
    const last = planStep({ ...crit, step: 3, callAttempts: 1 }, allOn, now, 0);
    expect(last.sends.map((x) => x.channel)).toEqual(['voice']);
    expect(last.next).toBeNull();
  });

  it('respects consent, the call limit, the daily cap, STOP and quiet hours', () => {
    const now = new Date('2026-10-11T18:00:00Z'); // 23:30 IST
    expect(planStep({ ...crit, step: 2 }, { ...allOn, channels: { push: true } }, now, 0).skips[0]).toEqual({ channel: 'voice', reason: 'consent' });
    expect(planStep({ ...crit, step: 3, callAttempts: 2 }, allOn, now, 0).skips[0].reason).toBe('call_limit');
    expect(planStep({ ...crit, step: 2 }, { ...allOn, dailyCapInr: 2 }, now, 0).skips[0].reason).toBe('cap');
    expect(planStep({ ...crit, step: 1 }, { ...allOn, smsStopped: true }, now, 0).skips).toContainEqual({ channel: 'sms', reason: 'stopped' });
    const quiet = { ...allOn, quietStart: 22 * 60, quietEnd: 7 * 60 };
    expect(inQuietHours(now, quiet)).toBe(true);
    expect(planStep({ ...crit, step: 2 }, quiet, now, 0).skips[0].reason).toBe('quiet'); // no calls at night
    const ordinary = planStep({ ...crit, critical: false }, quiet, now, 0);
    expect(ordinary.sends).toEqual([]);
    expect(ordinary.deferUntil!.toISOString()).toBe('2026-10-12T01:30:00.000Z'); // 07:00 IST
  });
});

describe('notifications API', () => {
  beforeAll(async () => {
    const post = (p: string, b: unknown) => app.request(`/api${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    const otp = (await (await post('/auth/otp', { contact: '9820099999', purpose: 'signup' })).json()) as { devCode: string };
    const res = await post('/auth/signup', { name: 'Alerty', contact: '9820099999', code: otp.devCode, password: 'password-123' });
    cookie = res.headers.get('set-cookie')!.split(';')[0];
  }, 120_000);

  it('escalates a critical alert until acknowledged, as dry runs in demo mode', async () => {
    const prefs = await call('PUT', '/notifications/me/prefs', { channels: { push: true, email: false, sms: true, whatsapp: false, voice: true }, phone: '+91 98200 99999', email: null, timezone: 'UTC', quietStart: 0, quietEnd: 0, dailyCapInr: 20 });
    expect(prefs.status).toBe(200);
    const demo = await call('POST', '/notifications/me/demo', { scenario: 'gate_change', fast: true });
    const id = demo.body.notification.id;
    // One minute later: SMS; two minutes: call.
    await runDue(new Date(Date.now() + 61_000));
    await runDue(new Date(Date.now() + 123_000));
    const ev = (await call('GET', `/notifications/me/${id}/events`)).body.events as { channel: string; action: string; detail: string }[];
    expect(ev.map((e) => `${e.channel}:${e.action}`)).toEqual(expect.arrayContaining(['in_app:sent', 'push:dry_run', 'sms:dry_run', 'voice:dry_run']));
    expect(ev.some((e) => e.action === 'escalated')).toBe(true);
    expect(ev.find((e) => e.channel === 'sms')!.detail).not.toContain('99999'); // masked
    const { db } = await getDb();
    const outbox = await db.select().from(schema.outboundMessages).where(eq(schema.outboundMessages.relatedId, id));
    expect(outbox.length).toBeGreaterThanOrEqual(3);
    expect(outbox.every((m) => m.status === 'dry_run')).toBe(true);

    expect((await call('POST', `/notifications/me/${id}/ack`)).status).toBe(200);
    const before = (await call('GET', `/notifications/me/${id}/events`)).body.events.length;
    await runDue(new Date(Date.now() + 10 * 60_000));
    expect((await call('GET', `/notifications/me/${id}/events`)).body.events.length).toBe(before); // stopped
  });

  it('honours STOP only with a valid Twilio signature', async () => {
    const url = 'http://localhost/api/notifications/inbound/sms';
    const form = { From: '+919820099999', Body: 'STOP' };
    const send = (sig: string) => app.request(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig }, body: new URLSearchParams(form).toString() });
    expect((await send('bad')).status).toBe(403);
    expect((await send(twilioSignature('test-twilio-token', url, form))).status).toBe(200);
    expect((await call('GET', '/notifications/me/prefs')).body.prefs.smsStopped).toBe(true);
  });

  it('protects the cron trigger and validates input', async () => {
    expect((await app.request('/api/cron/tick')).status).toBe(401);
    expect((await app.request('/api/cron/tick', { headers: { authorization: 'Bearer cron-test-secret' } })).status).toBe(200);
    expect((await call('POST', '/notifications/me/demo', { scenario: 'nope' })).status).toBe(400);
    expect((await call('PUT', '/notifications/me/prefs', { channels: {}, timezone: 'Mars/Base' })).status).toBe(400);
  });
});
