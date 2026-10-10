# Voyage

Mobile-first travel PWA (Elevate 1.0, PS 01). React + Vite frontend, Hono API,
Postgres via Drizzle.

## Run it

```bash
npm install
npm run dev        # app + API on http://localhost:5173, API under /api
npm test
```

On first request the API creates a local Postgres in `.data/pglite`, applies
migrations and loads the seed data. To reload seed data: stop the dev server, then
`npm run seed`.

## Accounts

Sign up with an email or Indian mobile number, a 6-digit code and a password.
Passwords are hashed (bcrypt); sessions are httpOnly cookies whose token is stored
only as a hash. Forgot password and code log-in work the same way. Until an
email/SMS provider is connected the code is shown on screen.

Local test account (dev database only): mobile `9820011111`, password `voyage-test-pass`.

## Documents

Uploads (PDF, JPEG, PNG, WebP up to 4 MB; type checked from the file bytes) are
encrypted with AES-256-GCM and stored in Postgres. They open through HMAC-signed
links that expire after 5 minutes. ID numbers are validated (Aadhaar checksum,
PAN and passport formats) and only a masked form such as `XXXX XXXX 1234` is kept.
"Available offline" keeps a copy on the phone. Scans can be backed up to the account.

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
| Flights | **Live** from Amadeus when `AMADEUS_*` keys are set; otherwise airlines on the route from OpenFlights (2014 data, retired airlines removed) with duration and fare **estimated** from distance, labelled "Indicative". Booking is a link to Google Flights. | ODbL |

Refresh the open data with `npm run pipeline:openflights`,
`pipeline:destinations`, `pipeline:places`, `pipeline:images` (slow and polite; cached in `.data/raw`).

## Keys

See [API_KEYS_NEEDED.md](API_KEYS_NEEDED.md) and `.env.example`.

## Deploying (Vercel)

Set `DATABASE_URL` (Supabase/Neon). `api/index.ts` serves the
API; migrations run on cold start.
