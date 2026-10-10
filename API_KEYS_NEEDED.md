# API keys

Voyage runs with **no keys at all**. Each key below switches one feature from
seeded open data to a live provider. Put keys in `.env.local` (never in code,
never in chat) and in Vercel → Project → Settings → Environment Variables.

| Key | What it unlocks | Without it | Where to get it | Cost |
|---|---|---|---|---|
| `DATABASE_URL` | Shared cloud Postgres (needed on Vercel) | Local embedded Postgres (PGlite) | supabase.com or neon.tech → project → connection string (use the pooled one) | Free tier |
| `AUTH_SECRET` | Signs login sessions | Dev-only secret (refuses to start in production) | Any 32+ char random string | — |
| `GOOGLE_CLIENT_ID` / `_SECRET` | "Continue with Google" | Email + password only | console.cloud.google.com → Credentials → OAuth client | Free |
| `XAI_API_KEY` | Grok assistant | Groq if set, else rule-based answers | console.x.ai | Paid, small |
| `GROQ_API_KEY` | Groq assistant / translation | Rule-based answers | console.groq.com | Free tier |
| `AMADEUS_CLIENT_ID` / `_SECRET` | Live flight offers and hotel prices | OpenFlights routes, prices marked "indicative" | developers.amadeus.com (test env) | Free test tier |

Not used on purpose:
- **Skyscanner**: partner approval only, no self-serve keys.
- **Airbnb**: no public API and its terms forbid scraping; we link out instead.
