import { expect, test, type Page } from '@playwright/test';
import { textPdf } from '../server/pdf';

// Smoke test through the whole app, as a traveller would use it. Screenshots of every main
// screen are saved to docs/screenshots/qa-*.jpg. UI where it matters; the API (same session)
// for the long booking and cancellation steps.

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const phone = `98${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const PASSWORD = 'smoke-test-pass';
let shotNo = 0;

async function shot(page: Page, name: string) {
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  await expect(page.getByText('Something went wrong on this screen')).toHaveCount(0);
  await expect(page.getByText(/Please log in to continue/i)).toHaveCount(0);
  shotNo += 1;
  await page.screenshot({ path: `docs/screenshots/qa-${String(shotNo).padStart(2, '0')}-${name}.jpg`, type: 'jpeg', quality: 70 });
}

async function api(page: Page, method: 'GET' | 'POST', path: string, data?: unknown) {
  const res = method === 'GET' ? await page.request.get(`/api${path}`) : await page.request.post(`/api${path}`, { data });
  expect(res.status(), `${method} ${path}`).toBeLessThan(400);
  return res.json();
}

test('traveller journey: sign-up to masked document', async ({ page }) => {
  let tripId = '';
  const pushes: string[] = [];
  page.on('response', (r) => {
    const path = new URL(r.url()).pathname;
    if (path.includes('/sync/push')) pushes.push(`push ${JSON.parse(r.request().postData() ?? '{}').table} ${r.status()}`);
    else if (path.startsWith('/api/') && r.status() >= 400) pushes.push(`${r.request().method()} ${path} ${r.status()}`);
  });
  page.on('console', (m) => {
    if (/sync|error/i.test(m.text())) pushes.push(`console: ${m.text().slice(0, 160)}`);
  });

  await test.step('sign up: any number, code 123456, straight to Home with a server session', async () => {
    await page.goto('/welcome');
    await shot(page, 'welcome');
    await page.goto('/signup');
    await page.getByLabel('Your name').fill('Smoke Tester');
    await page.getByLabel('Mobile number').fill(phone);
    await shot(page, 'signup');
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.locator('input[inputmode=numeric], input[autocomplete=one-time-code]').first().fill('123456');
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 60_000 });
    await expect.poll(async () => (await page.request.get('/api/me')).status()).toBe(200);
    await shot(page, 'home');
  });

  await test.step('log out and log in with any number and password', async () => {
    await api(page, 'POST', '/auth/logout');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/login');
    await page.locator('input:not([type=password])').first().fill(phone);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 60_000 });
    await expect.poll(async () => (await page.request.get('/api/me')).status()).toBe(200);
  });

  await test.step('budget search and pick a destination', async () => {
    await page.goto('/plan');
    await shot(page, 'budget-planner');
    const where = await api(page, 'GET', '/budget/where?budget=40000&from=BOM&days=4&travellers=2').catch(() => null);
    if (where) expect(JSON.stringify(where).length).toBeGreaterThan(10);
    await page.goto('/destinations');
    await shot(page, 'destinations');
    await page.goto('/destinations/jaipur');
    await shot(page, 'destination-jaipur');
  });

  await test.step('create a trip', async () => {
    await page.goto('/trips/new');
    await page.getByLabel('From').fill('Mumbai');
    await page.getByLabel('To').fill('Jaipur');
    await page.getByLabel('Leave').fill(day(30));
    await page.getByLabel('Return').fill(day(33));
    await shot(page, 'new-trip');
    await page.getByRole('button', { name: 'Create trip' }).click();
    await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
    tripId = page.url().split('/trips/')[1];
    await shot(page, 'trip-workspace');
  });

  await test.step('flights and hotels', async () => {
    await page.goto(`/trips/${tripId}/flights`);
    await shot(page, 'flights');
    await page.goto(`/trips/${tripId}/accommodation`);
    await shot(page, 'hotels');
  });

  let bookingId = '';
  await test.step('pay in test mode', async () => {
    const order = await api(page, 'POST', '/payments/checkout', {
      idempotencyKey: `smoke-${phone}`,
      booking: { clientId: `smoke-hotel-${phone}`, kind: 'hotel', title: 'Smoke Test Haveli, Jaipur', amountInr: 7200, startsAt: new Date(day(30)).toISOString(), cancellationPolicy: { kind: 'hotel', totalInr: 7200, nights: 3, freeCancelUntil: new Date(day(20)).toISOString(), penaltyNights: 1, nonRefundable: false } },
    });
    const pay = await api(page, 'POST', '/payments/demo-pay', { orderId: order.orderId, outcome: 'success' });
    await api(page, 'POST', '/payments/verify', { orderId: pay.orderId, paymentId: pay.paymentId, signature: pay.signature, method: 'upi' });
    const { bookings } = await api(page, 'GET', '/bookings');
    const b = bookings.find((x: { clientId: string }) => x.clientId === `smoke-hotel-${phone}`);
    expect(b.status).toBe('confirmed');
    bookingId = b.id;
  });

  await test.step('itinerary, then "I feel sick"', async () => {
    // The trip syncs to the server in the background; wait until the planner can see it.
    await expect
      .poll(
        async () => {
          const r = await page.request.post(`/api/itineraries/${tripId}/generate`);
          return r.status() === 200 ? 'ok' : `${r.status()} ${(await r.text()).slice(0, 80)} | ${pushes.join(' ; ')} | trips: ${(await (await page.request.get('/api/trips')).text()).slice(0, 300)} | id: ${tripId}`;
        },
        { timeout: 90_000, intervals: [3_000] },
      )
      .toBe('ok');
    const cur = await api(page, 'GET', `/itineraries/${tripId}`);
    const sick = await api(page, 'POST', `/itineraries/${tripId}/adapt`, { mode: 'sick', date: day(31), baseVersion: cur.itinerary.version });
    expect(sick.emergency.numbers).toBeTruthy();
    await page.goto(`/trips/${tripId}/itinerary`);
    await shot(page, 'itinerary-after-sick');
  });

  await test.step('experiences, restaurants and transport', async () => {
    for (const m of ['experiences', 'restaurants', 'transportation', 'budget']) {
      await page.goto(`/trips/${tripId}/${m}`);
      await shot(page, m);
    }
  });

  await test.step('cancel the hotel, refund tracker and Outbox', async () => {
    const quote = await api(page, 'POST', '/cancellations/quote', { bookingId, reason: 'Smoke test' });
    const done = await api(page, 'POST', `/cancellations/${quote.request.id}/confirm`, { confirm: true });
    expect(['refunded', 'partially_refunded', 'submitted', 'acknowledged', 'processing']).toContain(done.request.status);
    // An outside flight: the cancellation email goes to the Outbox (dry run), never really sent.
    const ext = await api(page, 'POST', '/cancellations/quote', { booking: { clientId: `smoke-ext-${phone}`, kind: 'flight', title: 'IndiGo 6E 5321 BOM-JAI', amountInr: 6400, provider: 'IndiGo', pnr: 'SMK123', startsAt: new Date(day(30)).toISOString(), paymentMethod: 'card' } });
    const draft = await api(page, 'POST', `/cancellations/${ext.request.id}/email/draft`, { kind: 'cancel' });
    const sent = await api(page, 'POST', `/cancellations/${ext.request.id}/email/send`, { to: 'support@example.com', subject: draft.subject, body: draft.body, confirm: true });
    expect(sent.outbox.status).toBe('dry_run');
    await page.goto('/refunds');
    await shot(page, 'refund-tracker');
    await page.goto('/outbox');
    await expect(page.getByText(/SMK123|IndiGo/).first()).toBeVisible();
    await shot(page, 'outbox');
  });

  await test.step('chatbot and voice', async () => {
    const chat = await api(page, 'POST', '/assistant/chat', { message: 'What is the weather like in Jaipur?' });
    expect(JSON.stringify(chat).length).toBeGreaterThan(20);
    await api(page, 'GET', '/assistant/voice');
    await page.goto('/assistant');
    await shot(page, 'assistant');
  });

  await test.step('packing list', async () => {
    await page.goto(`/trips/${tripId}/packing`);
    await page.getByRole('checkbox').first().check();
    await expect(page.getByText(/1 of \d+ packed/)).toBeVisible();
    await shot(page, 'packing');
  });

  await test.step('notifications escalate until acknowledged', async () => {
    await page.goto('/notifications');
    await page.getByRole('button', { name: 'Gate change' }).click();
    await expect(page.getByRole('button', { name: 'Acknowledge' }).first()).toBeVisible();
    await shot(page, 'notifications');
    await page.getByRole('button', { name: 'Acknowledge' }).first().click();
  });

  await test.step('upload and mask a document', async () => {
    // A made-up Aadhaar (valid checksum, not a real person), generated here and never committed.
    const pdf = textPdf([{ text: 'Government of India' }, { text: 'Name: Smoke Tester' }, { text: 'DOB: 14/08/1990' }, { text: 'Aadhaar No: 2341 2341 2346' }] as never);
    await page.goto('/wallet/add');
    await page.locator('input[type=file]').setInputFiles({ name: 'aadhaar.pdf', mimeType: 'application/pdf', buffer: pdf });
    await page.getByRole('button', { name: 'ID card' }).click();
    await expect(page.getByText(/Hidden:.*Aadhaar/)).toBeVisible({ timeout: 60_000 });
    await shot(page, 'mask-preview');
    await page.getByRole('button', { name: 'Use masked copy' }).click();
    await page.getByRole('button', { name: 'Save to my account' }).click();
    await expect(page).toHaveURL(/\/wallet\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Masked copy', { exact: true }).first()).toBeVisible();
    await shot(page, 'masked-document');
  });

  await test.step('privacy and the rest of Me', async () => {
    for (const p of ['/wallet', '/me', '/privacy', '/trips']) {
      await page.goto(p);
      await shot(page, p.slice(1));
    }
  });
});

test('"Continue as demo" gives a working session for every feature', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const log: string[] = [];
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/')) log.push(`${r.request().method()} ${u.pathname} ${r.status()}`);
  });
  page.on('console', (m) => m.type() === 'error' && log.push(`console ${m.text().slice(0, 120)}`));
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue as demo' }).click();
  await expect(page).toHaveURL(/\/home/, { timeout: 60_000 });
  await expect.poll(async () => `${(await page.request.get('/api/me')).status()} | ${log.join(' ; ')}`).toMatch(/^200/);
  for (const p of ['/home', '/plan', '/trips', '/wallet', '/notifications', '/refunds', '/outbox', '/assistant', '/me', '/privacy']) {
    await page.goto(p);
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    await expect(page.getByText('Something went wrong on this screen'), p).toHaveCount(0);
    await expect(page.getByText(/Please log in to continue/i), p).toHaveCount(0);
  }
  await ctx.close();
});
