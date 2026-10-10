# Decisions (autonomous build, branch `feature/complete-app`)

One line each, in the order they were made.

- Branch `feature/complete-app` from `main` at the Phase 13 commit; all work committed per section, no history rewrites.
- Stack stays as built: Vite + React PWA, Hono API (`server/`), Postgres via Drizzle (PGlite locally). No rebuild of Phases 1–11.
- Airline sentiment analysis skipped, as the spec says.
- Demo mode: every provider has a mock/fallback; fallback data shows a small "Demo data" badge.
- Outbound safety: email/SMS/WhatsApp/calls/payments only go out when the provider key is set AND `ALLOW_REAL_OUTBOUND=true`; otherwise they are written to the in-app Outbox.
- Budget split keeps the spec default (35/30/20/10/5); "activities" is an extra slider at 0% and, until set, daily activities come out of the buffer.
- Destination cost index is derived from the curated daily costs (stay 45%, food 30%, local 12%, activities 13%), source `voyage-estimate-v1`; Numbeo needs a paid key, so the refresh script only notes it.
- Trip totals for "Where can I go?" use return flights from the distance fare model, 2 people per room, and a 5% buffer; all shown as estimates.
- Cheapest-dates calendar uses the fare model with a day-of-week factor; Amadeus/Travelpayouts calendar search is not wired (no keys) and the note says so.
- Expenses and paid/cancelled bookings feed the spending tracker; refunds count back.
- Payments: `PaymentProvider` with Razorpay (Orders API, checkout.js, HMAC signature check, webhook signature on the raw body, refunds) and a demo provider that signs the same way, so the full flow runs with no keys. Stripe left out (optional in the spec).
- Bookings paid in Voyage live in the server `bookings` table (extended additively) and are mirrored on the phone; points used (1 point = Rs 1, max 20%) reduce the balance; cancelled bookings stop earning.
- Refund rules for Indian air tickets are an editable JSON (`server/config/refund-rules.json`): 48 h free look for direct bookings 7/15 days out, taxes refundable, fee capped at base fare, refund in 7 days (cards) / 30 days (agents). Labelled "verify with airline"; no web search was run.
- Bookings without a provider policy get a default policy marked as an estimate (flight 78/18/4 split of base/taxes/fee; stays free until 48 h before, then 1 night; activities 24 h).
- Duffel/Amadeus order cancellation not wired (no keys): in-app bookings refund through the payment provider; outside bookings use the Cancellation Assistant.
- Provider contacts store official support page URLs only; no email addresses were invented (all `verified=false`), so the user types the address from the support page.
- Inbound email: generic webhook `/api/inbound/email/:secret` (SendGrid/Postmark shapes); replies become suggestions the user confirms. Gmail read-only OAuth not built (needs a Google OAuth app).
- QA runs on a separate dev server (`npm run dev:qa`, port 5174, database `.data/pglite-qa`) because the user's own dev server was holding the main local database.
