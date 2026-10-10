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

## Data: live vs fallback

| Area | Source today | Licence |
|---|---|---|
| Airports, airlines, routes | OpenFlights (3,141 airports, 65k routes) | ODbL |
| Destinations (53) | Curated list + Wikipedia summaries | CC BY-SA |
| Destination photos | Wikimedia Commons, with author + licence | per image |
| Hotels, attractions, restaurants | OpenStreetMap; hotel prices are **estimates** | ODbL |
| Flight prices | Not live yet (Phase 7, Amadeus) | — |

Refresh the open data with `npm run pipeline:openflights`,
`pipeline:destinations`, `pipeline:places` (slow and polite; cached in `.data/raw`).

## Keys

See [API_KEYS_NEEDED.md](API_KEYS_NEEDED.md) and `.env.example`.

## Deploying (Vercel)

Set `DATABASE_URL` (Supabase/Neon). `api/index.ts` serves the
API; migrations run on cold start.
