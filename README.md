# Voyage

Mobile-first travel PWA (Elevate 1.0, PS 01). React + Vite frontend, Hono API,
Postgres via Drizzle.

## Run it

```bash
npm install
npm run dev        # app + API on http://localhost:5173, API under /api
npm test           # unit + API tests (Vitest, in-memory Postgres)
npm run test:e2e   # Playwright smoke test through the whole journey (uses installed Edge)
npm run lint
npm run build      # type check, app build, and the bundled API for Vercel
```

`npm run dev:qa` runs a second copy on port 5174 with its own database (`.env.qa.local`).

## Architecture

```
React PWA (Vite, Tailwind, Framer Motion)          Hono API (server/, one Vercel function)
  screens/ ─ hooks/ ─ engines/ (pure logic,  ──/api──▶  routes/ ─ engines (shared) ─ providers
  shared with the server)                               │        (Amadeus, Open-Meteo, xAI/Groq,
  Dexie offline store + sync queue ──────────▶ /sync    │         Razorpay, Resend, Twilio, …)
  on-device masking (pdf.js, tesseract.js)              ▼
                                               Postgres via Drizzle (PGlite locally, Neon/Supabase)
```

- **Offline first:** trips, bookings and lists are written to IndexedDB and queued; the queue
  replays to `/api/sync/push` (idempotency keys, revisions, conflict prompts).
- **Engines** in `src/engines` (budget, refund, planner, packing, persona, redaction) are pure
  functions used by both the app and the API, and unit-tested.
- **Every third-party call goes through the API**; keys never reach the browser.
- **Outbound safety:** `server/outbound.ts` is the only way anything is sent. Without a key
  and `ALLOW_REAL_OUTBOUND=true` it writes to the Outbox instead.
- **Notifications:** a durable schedule in Postgres, claimed with compare-and-set, run by Vercel
  Cron, the dev server and the app's own polling; critical alerts escalate until acknowledged.
- **Security:** CSP and secure headers, cross-site request guard, rate limits, zod on every
  route, ownership checks, signed webhooks (Razorpay, Twilio, WhatsApp), SSRF allowlist,
  encrypted documents, PII-free logs. Details in [DECISIONS.md](DECISIONS.md).

On first request the API creates a local Postgres in `.data/pglite`, applies
migrations and loads the seed data. To reload seed data: stop the dev server, then
`npm run seed`.

## Accounts

Sign up with an email or Indian mobile number, a 6-digit code and a password.
Passwords are hashed (bcrypt); sessions are httpOnly cookies whose token is stored
only as a hash. Forgot password and code log-in work the same way. Until an
email/SMS provider is connected the code is shown on screen.

Local test account (dev database only): mobile `9820011111`, password `voyage-test-pass`.
On a fresh deployment, sign up: the code is shown on screen while no SMS provider is connected.

Me → Privacy and your data: privacy notice, download all your data (JSON), delete the account.

## Documents

Uploads (PDF, JPEG, PNG, WebP up to 4 MB; type checked from the file bytes) are
encrypted with AES-256-GCM and stored in Postgres. They open through HMAC-signed
links that expire after 5 minutes. ID numbers are validated (Aadhaar checksum,
PAN and passport formats) and only a masked form such as `XXXX XXXX 1234` is kept.
"Available offline" keeps a copy on the phone. Scans can be backed up to the account.

**Masking:** passports, visas and ID cards are masked on the phone before upload. Text comes
from the PDF's text layer (or OCR for scans and photos); Aadhaar (checksum-verified, first 8
digits), PAN, passport and licence numbers, date of birth, address and passport MRZ lines are
painted out of the page pixels and the PDF is rebuilt from images, so nothing under a box can
be copied. The masked copy is what you see and share; the original stays encrypted until you
delete it.

## Assistant

With `XAI_API_KEY` (Grok) or `GROQ_API_KEY` the assistant chats using tools that read
the traveller's own trips, saved options and documents (masked), the destination
catalogue, flight and stay search and weather. Every rupee amount in a reply must
appear in the tool results, or the reply is retried and then stripped of prices.
Conversations are saved on the account. Without a key (or offline) the on-device
assistant answers: keyword intents in 6 languages, and any of the 53 destinations by
name. Voice typing and read-aloud use the browser's speech features.

"Paste booking" reads a confirmation email/SMS (AI when keyed, pattern rules always).
Only values that literally appear in the pasted text are kept.

## Data: live vs fallback

| Area | Source today | Licence |
|---|---|---|
| Airports, airlines, routes | OpenFlights (3,141 airports, 65k routes) | ODbL |
| Destinations (53) | Curated list + Wikipedia summaries | CC BY-SA |
| Destination photos | Wikimedia Commons, stored in `public/img` (works offline); authors on the Credits screen | per image |
| Hotels, attractions, restaurants | OpenStreetMap. Hotel search is **live** from Amadeus when keyed; otherwise OSM hotels with a price **range estimated** from the hotel class and local costs. Airbnb: link out only (no public API; no scraping). | ODbL |
| Weather | **Live**: Open-Meteo (no key), cached 30 min | CC BY 4.0 |
| Exchange rates | **Live**: Frankfurter/ECB, ExchangeRate-API for others; cached 6 h | free use |
| Payments | Razorpay **test mode** when keyed; otherwise a built-in demo provider (HMAC-signed) | — |
| Email, SMS, WhatsApp, calls, push | **Outbox dry run** unless keyed and `ALLOW_REAL_OUTBOUND=true` (email only has a real adapter) | — |
| Assistant | **Live** Grok/Groq when keyed; otherwise rule-based answers | — |
| Weather for trip dates | Forecast within 6 days, otherwise the same dates last year (Open-Meteo archive) | CC BY 4.0 |
| Cost of living / budgets | Seeded cost index; Numbeo when keyed | — |
| Flight status alerts | Demo alerts in Notifications (no live status feed connected) | — |
| OCR for masking | tesseract.js in the browser, language data from jsDelivr | Apache 2.0 |
| Flights | **Live** from Amadeus when `AMADEUS_*` keys are set; otherwise airlines on the route from OpenFlights (2014 data, retired airlines removed) with duration and fare **estimated** from distance, labelled "Indicative". Booking is a link to Google Flights. | ODbL |

Refresh the open data with `npm run pipeline:openflights`,
`pipeline:destinations`, `pipeline:places`, `pipeline:images` (slow and polite; cached in `.data/raw`).

## Keys and environment

See [API_KEYS_NEEDED.md](API_KEYS_NEEDED.md) (must-have / nice-to-have / needs approval),
[DEPLOY_ENV.md](DEPLOY_ENV.md) (everything to paste into Vercel) and `.env.example`.

## Deploying (Vercel)

1. Import the GitHub repo in Vercel (framework: Vite; build `npm run build`; output `dist`).
2. Storage → Create Database → Neon (connect to the project) so `DATABASE_URL` is set for you,
   or paste a Supabase **Transaction pooler** string.
3. Add `DOCS_ENCRYPTION_KEY`, `MOCK_PAYMENT_SECRET`, `CRON_SECRET` and `OTP_SHOW_CODE=on`
   (see [DEPLOY_ENV.md](DEPLOY_ENV.md)), then Redeploy.
4. Open `/api/health`: it shows `"ok":true`, or exactly what is wrong with the database setting.

`npm run build` bundles the API into `api/index.js` (one file, so Node's ESM loader on Vercel
needs no extensionless imports). `vercel.json` routes `/api/*` to it, sets the security
headers and a daily cron for reminders. Migrations and seed data run on the first request.

Render or any Node host also works: run `npm run build`, serve `dist/` statically and mount
`api/index.js` (a Node request handler) under `/api`.
