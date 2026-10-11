# API keys

Voyage runs with **no keys at all**: every integration falls back to open or demo data and
says so in the UI. Each key below switches one feature to a live provider. Put keys in
`.env.local` (never in code, never in chat) and in Vercel → Project → Settings →
Environment Variables. The full paste list for Vercel is in [DEPLOY_ENV.md](DEPLOY_ENV.md).

Nothing is ever sent to a real person (email, SMS, WhatsApp, call) unless the provider key
is set **and** `ALLOW_REAL_OUTBOUND=true`. Otherwise it is logged to the in-app Outbox.
Payments are always in test mode.

## Must have (for a deployed demo)

| Key | What it unlocks | Without it | Where to get it | Cost |
|---|---|---|---|---|
| `DATABASE_URL` | Shared cloud Postgres (required on Vercel) | Local embedded Postgres (PGlite) | [neon.tech](https://neon.tech) (via Vercel → Storage) or [supabase.com](https://supabase.com) → Connect → Transaction pooler | Free tier |
| `DOCS_ENCRYPTION_KEY` | Encrypts uploaded documents, signs 5-minute view links | Dev key in `.data/`; **uploads refused in production** | Generate locally (see `.env.example`). Back it up | — |
| `MOCK_PAYMENT_SECRET` | Signs demo payments | A public default (fine locally, not on a public URL) | Any long random string | — |
| `CRON_SECRET` | Lets Vercel Cron deliver scheduled reminders | Reminders still go out while the app is open | Any long random string | — |

## Nice to have

| Key | What it unlocks | Without it | Where to get it | Cost |
|---|---|---|---|---|
| `XAI_API_KEY` (+ `XAI_MODEL`) | Grok assistant with tools | Groq if set, else rule-based answers | [console.x.ai](https://console.x.ai) | Paid, small |
| `GROQ_API_KEY` (+ `GROQ_MODEL`) | Groq assistant, booking reading | Rule-based assistant; pasted bookings read by patterns | [console.groq.com](https://console.groq.com) | Free tier |
| `DEEPGRAM_API_KEY` or `OPENAI_API_KEY` | Server speech-to-text when the browser cannot | Browser speech only | [deepgram.com](https://deepgram.com) / [platform.openai.com](https://platform.openai.com) | Free credit |
| `AMADEUS_CLIENT_ID` / `_SECRET` / `AMADEUS_ENV` | Live flight offers and hotel prices | OpenFlights routes and OSM hotels, prices marked "indicative" | [developers.amadeus.com](https://developers.amadeus.com) (test env) | Free test tier |
| `GOOGLE_MAPS_API_KEY` | Google ratings and place details | OpenStreetMap places, review links to Google Maps search | [console.cloud.google.com](https://console.cloud.google.com) → Places API (New) | Free monthly credit |
| `NUMBEO_API_KEY` | Live cost-of-living index | Seeded cost index | [numbeo.com/api](https://www.numbeo.com/api/) | Paid |
| `RAZORPAY_KEY_ID` / `_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Razorpay checkout (**test keys only**, `rzp_test_…`) | Built-in demo payment provider | [dashboard.razorpay.com](https://dashboard.razorpay.com) → Test mode → API keys | Free (test) |
| `RESEND_API_KEY` + `EMAIL_FROM` | Real email (only with `ALLOW_REAL_OUTBOUND=true`) | Outbox dry run | [resend.com](https://resend.com) | Free tier |
| `INBOUND_EMAIL_SECRET` / `INBOUND_EMAIL_DOMAIN` | Provider replies routed to the cancellation assistant | Paste the reply into the app | Your inbound email provider's webhook | — |

## Needs approval or registration first

| Key | What it unlocks | Approval needed | Where |
|---|---|---|---|
| `MSG91_AUTH_KEY` | SMS in India | DLT registration of sender ID and templates (TRAI rules) | [msg91.com](https://msg91.com) |
| `TWILIO_ACCOUNT_SID` / `_AUTH_TOKEN` / `TWILIO_FROM` | SMS and automated calls (escalation), STOP and "press 1" callbacks | Verified number; India SMS also needs DLT | [twilio.com/console](https://www.twilio.com/console) |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` / `WHATSAPP_VERIFY_TOKEN` / `WHATSAPP_APP_SECRET` | WhatsApp alerts and replies | Meta business verification and approved message templates | [developers.facebook.com](https://developers.facebook.com/docs/whatsapp/cloud-api) |
| `FCM_SERVER_KEY` | Web push | Firebase project | [console.firebase.google.com](https://console.firebase.google.com) |
| `GOOGLE_CLIENT_ID` / `_SECRET` | "Continue with Google" (not wired yet) | OAuth consent screen | [console.cloud.google.com](https://console.cloud.google.com) |

SMS, WhatsApp, call and push adapters stay dry runs even with keys (only email has a real
adapter); the Outbox and each notification's timeline show exactly what would have gone out.

Not used on purpose:
- **Skyscanner**: partner approval only, no self-serve keys.
- **Airbnb**: no public API and its terms forbid scraping; we link out instead.
