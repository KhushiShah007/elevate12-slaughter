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
- Itinerary is stored as one validated JSON plan per trip (`itineraries.plan`) with full snapshots in `itinerary_versions` (reason + readable diff, used for Undo), instead of separate itinerary_days/itinerary_items tables: simpler atomic versioning; the item fields match the spec (type, start/end, place, coordinates, cost, intensity 1-5, indoor, booking, locked, status).
- Planner is deterministic (no LLM): nearest-neighbour clustering by coordinates, travel time ~20 km/h + 10 min (Google Routes not wired: no key), OpenStreetMap opening hours parsed, meal slots, family/slow rest breaks, daily intensity cap, daily budget, indoor-first on forecast rain days.
- With a trip budget, places are priced at the style the on-the-ground money covers (65% of budget / days / travellers), not the persona's style.
- Today mode: sick (only easy items, rest, pharmacy/hospital links, local emergency number), tired/lighter (~60% effort, gentle indoor addition), rain (indoor swaps), late (shift, drop overflow), skip, add, overspend (cheaper swaps). Locked items never move; paid items warn and link to Cancel/Refund.
- Real-time sync: Server-Sent Events from the API plus a 60 s poll fallback (serverless hosts cut long streams); version numbers reject stale writes (409).
- Vegetarian travellers: places marked vegetarian first, untagged places allowed (most OSM listings have no diet tag), places tagged non-vegetarian never.
- Dev server applies new migration files on the next request (no restart needed); a dev server started before that code needs one restart.
- Famous vs hidden gem: famous = the OpenStreetMap place has a Wikipedia/Wikidata link; niche score = high rating with few reviews when Google ratings exist, else 0.6 for documented non-famous places. Reddit/Foursquare/OpenTripMap signals not added (keys/approval).
- Experience booking links are search deep links (GetYourGuide, Viator, Klook, Airbnb Experiences, official site) with an affiliate disclosure; partner APIs need approval.
- Restaurant diet tags (veg/vegan/Jain/halal), phone, website and reservation come from OSM tags (re-derived from the cached downloads, no new fetching); signature dishes are not shown (no open source).
- Test runner limited to 3 parallel files (each server test boots an in-memory Postgres with seed data).
- Transportation between cities: flight from the flight provider plus estimated train (3AC ~Rs 1.6/km), bus (AC sleeper ~Rs 1.3/km) and outstation cab (~Rs 12/km, 18 for SUVs); IRCTC and redBus have no open API, so they are deep links behind `TrainProvider`/`BusProvider` stubs; Rome2Rio link for more routes. Amadeus Transfer Search not wired (no keys); car rentals are link-outs (Zoomcar / Rentalcars.com).
- Chatbot: `LLMProvider` = Grok (XAI_MODEL, default grok-3-mini) or Groq, with a server rule-based fallback that uses the same tools, so the bot answers with no key or when the AI fails; the phone's on-device assistant still answers offline.
- Streaming: tools run first, then the final answer streams token by token (SSE); answers that need no tools are sent in word chunks. The price guard runs on the full text and replaces the reply if needed.
- Chat tools can replan the itinerary (undoable) and start a cancellation quote, but never cancel, pay or send: confirmation stays in the UI.
- Voice: Web Speech API with clear permission/error messages and https check; where unsupported, MediaRecorder + server STT (Deepgram or Whisper when keyed); read-aloud with stop and mute; spoken questions get spoken answers. ElevenLabs/Google TTS not wired.

## Section 10: notifications
- **Scheduler:** no Inngest/BullMQ. The `notifications` table is the durable queue (UTC `next_at`); `runDue` claims rows with a compare-and-set on `next_at`, so concurrent runners never double-send and a crash retries after 2 minutes. It is triggered by Vercel Cron (`/api/cron/tick`, daily on Hobby), a 30 s timer in the dev server, and the app's own polling of `/api/notifications` (every 15–30 s while open). No extra service or key needed.
- **Ladder:** in-app + push (+ email) → WhatsApp (or SMS) → call → second call. 30 min per step, `leaveBy` shortens it to a third of the time left (5–30 min). Demo alerts use 1-minute steps.
- **Consent:** every channel is off until switched on; calls never in quiet hours; ordinary notifications wait for quiet hours to end; daily cost cap with rough per-message costs; STOP (Twilio-signed inbound SMS) pauses SMS and WhatsApp until the user opts in again.
- **Real push (FCM) and real SMS/WhatsApp/voice adapters** stay dry runs even with keys (only email has a real adapter); the timeline and Outbox show exactly what would have been sent.

## Section 11: document masking
- **On the device, not PyMuPDF:** the stack is Node on Vercel (no Python), so masking runs in the browser: pdf.js renders pages and gives the text layer, tesseract.js (lazy-loaded) reads scans and photos. The originals' sensitive values never need to be processed on the server.
- **True redaction:** boxes are painted into the page pixels and the masked PDF is rebuilt from JPEG page images (existing `imagesToPdf`), so the masked file has no text layer at all. The server double-checks: a "masked" PDF with fonts, object streams or forms is refused (422).
- **Aadhaar:** 12 digits passing Verhoeff; only the first 8 digits are covered. DOB only on lines labelled DOB/Year of Birth (expiry dates stay visible). Address: the labelled line plus following lines until the PIN code.
- **Storage:** masked copy encrypted (AES-GCM) in `document_masked_blobs`; links default to the masked copy and are signed separately (a masked link cannot open the original). The original can be erased, keeping the masked copy.
- **Claude vision fallback not built** (blocked by the agent's safety check on sending document images to a third party); patterns + manual boxes cover it for now.

## Section 12: security
- **CSRF:** cookies are httpOnly + SameSite=Lax; on top, every non-GET API request with a foreign Origin (or `Sec-Fetch-Site: cross-site`) is refused. Webhooks are exempt and verified by signature instead (Razorpay HMAC, Twilio HMAC-SHA1, WhatsApp `X-Hub-Signature-256`, inbound email secret, `CRON_SECRET`).
- **CSP** lives in `vercel.json` (the API also sends Hono's secure headers). It allows Razorpay checkout and the jsDelivr/tessdata hosts that OCR loads lazily; `'wasm-unsafe-eval'` is needed for OCR's WebAssembly; inline styles are allowed for animations.
- **SSRF:** the shared fetch helper only reaches an allowlist of API hosts; no route fetches a user-supplied URL.
- **Account deletion** cascades through foreign keys, then sweeps any table with a `user_id` column; export skips sessions, codes, password hashes and encrypted blobs.
- **Audit:** `npm audit fix` hung on the registry mirror, so patched versions were installed directly. drizzle-orm 0.45 and react-router 7 are majors and were deferred (documented in Known gaps).

## Section 14: QA
- **Playwright without a browser download:** the registry for browser binaries is unreachable here, so the smoke test drives the Microsoft Edge already installed (`channel: 'msedge'`; set `PW_CHANNEL=chrome` to use Chrome). It starts its own dev server on port 5175 with a throwaway database and blank AI keys (deterministic, no spend).
- **UI where it matters, API for long steps:** sign-up, login, trip creation, packing, notifications and document masking go through the UI; payment, cancellation and the itinerary adapt run through the same session's API. Every main screen is checked for the error boundary and screenshotted.
- **Fixes found by the smoke test:** the sync queue could miss a change written while a sync run was finishing (now it runs one more pass); packing ticks waited for the database round-trip (now optimistic).
- The test Aadhaar PDF is generated at run time (made-up number with a valid checksum) and never committed.
