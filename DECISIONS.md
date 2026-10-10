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
