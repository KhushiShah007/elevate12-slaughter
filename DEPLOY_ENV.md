# Deploying to Vercel

`vercel.json` is already in the repo: it sends `/api/*` to the Hono function (`api/index.ts`) and everything else to the app. Build command `npm run build`, output `dist` (Vercel detects Vite).

Paste these in **Vercel → Project → Settings → Environment Variables**. Never prefix any of them with `VITE_` (they must stay server-side).

## Required

| Variable | Value |
|---|---|
| `DATABASE_URL` | Postgres connection string. Supabase: Project → Connect → **Transaction pooler** (host `aws-0-…pooler.supabase.com`, port `6543`); the direct `db.…supabase.co` host does not work from Vercel. Replace `[YOUR-PASSWORD]` with your real password (brackets removed). No quotes. Neon: the pooled string. Migrations and seed data run on first request. |
| `DOCS_ENCRYPTION_KEY` | 32 random bytes, base64. Make one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Keep a copy; losing it makes uploaded documents unreadable. |
| `MOCK_PAYMENT_SECRET` | Any long random string. Signs demo payments when Razorpay keys are absent; without it a public default is used. |

## Recommended for the demo

| Variable | Value |
|---|---|
| `OTP_SHOW_CODE` | `on`: shows the sign-in code on screen (no SMS/email provider is sending). |
| `ALLOW_REAL_OUTBOUND` | `false`: everything goes to the in-app Outbox as a dry run. |
| `XAI_API_KEY` | Grok key; without it the assistant uses its rule-based answers. |
| `XAI_MODEL` | `grok-3-mini` |

## Recommended for notifications

| Variable | Value |
|---|---|
| `CRON_SECRET` | Any long random string. Vercel Cron sends it to `/api/cron/tick` (daily on the Hobby plan; the open app also delivers due reminders every 30 s). |

## Optional (each feature falls back to demo/open data without it)

| Variable | Unlocks |
|---|---|
| `GROQ_API_KEY`, `GROQ_MODEL` | Alternative LLM if no Grok key (`llama-3.3-70b-versatile`) |
| `DEEPGRAM_API_KEY` or `OPENAI_API_KEY` | Server speech-to-text when the browser cannot transcribe |
| `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET`, `AMADEUS_ENV` | Live flight and hotel offers (`AMADEUS_ENV=test`) |
| `GOOGLE_MAPS_API_KEY` | Google ratings and places |
| `NUMBEO_API_KEY` | Live cost-of-living index |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay checkout (**test keys only**, `rzp_test_…`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email (only sent if `ALLOW_REAL_OUTBOUND=true`) |
| `INBOUND_EMAIL_SECRET`, `INBOUND_EMAIL_DOMAIN` | Airline/hotel replies routed to the cancellation assistant |
| `MSG91_AUTH_KEY` | SMS in India |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | SMS / calls |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | WhatsApp messages |
| `FCM_SERVER_KEY` | Push notifications |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Reserved for Google sign-in (not wired yet) |

## Do not set on Vercel

`PGLITE_DIR`, `SEED_LIGHT`, `MIGRATIONS_DIR` are only for local development and tests. `VERCEL` and `NODE_ENV` are set by Vercel itself.
