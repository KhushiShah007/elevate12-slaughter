# VOYAGE: Project Brief for Claude Code

Read this whole file before doing anything. It is the source of truth for what we are building. Hackathon: Elevate 1.0 (DJSCE), Problem Statement PS 01 "Seamless Aviation Journey Experience". We are 3 beginners with about 18 hours. We want to win on UI/UX first, then on technical depth.

## 1. What we are building (one paragraph)

Voyage is a mobile-first PWA that looks after a traveller through the whole flight journey: plan the trip, carry documents, get to the airport, handle delays and missed connections, and keep family informed. It shows the TRUE cost of a journey (not only the ticket), ranks recovery options when something breaks, works with no internet, and speaks English, Hindi, Hinglish, Marathi, Tamil and Bengali. Tone: a calm, premium travel concierge, never a generic dashboard.

## 2. Main goals (build in this order, each one small)

1. **Layout and look.** Design system, app shell, all main screens as clickable mock screens with sample data.
2. **Trip data + offline foundation.** One data model, saved locally, app opens in airplane mode.
3. **Disruption-cascade engine.** Delay one event, see every knock-on effect (connection, hotel, cab, family). Plain code, no AI needed.
4. **Ranked options + true cost + recheck-then-confirm.**
5. **Languages + Hinglish voice/text assistant.**
6. **Personas (quiz that reshapes the app), documents vault, itinerary, extras.**
7. **Judge Mode + demo polish.**

Do ONE goal at a time. After each goal: run the app, take a screenshot, fix what looks wrong, commit.

## 3. Design direction

Mood: warm, tactile, travel-scrapbook. Think passport stamps, boarding passes, luggage tags, window-seat sky. Inspiration images are in `/design-inspo`. Look at them before designing.

- **Background:** beige / warm ivory / sand. Never pure white.
  - ivory `#F5EFE3`, paper `#FBF7EE`, sand `#E8DCC8`
- **Text:** dark only. Charcoal / espresso.
  - ink `#1E1A17`, espresso `#3A2E27`, muted `#7A6F66`
- **Widgets:** soft pastels on the beige. Each module gets its own pastel so screens are easy to tell apart:
  - peach `#F6D5C2`, lavender `#DCD3F0`, mint `#CFE6D6`, butter `#F5E6B3`, sky `#CFE3F0`, rose `#F2CFD6`
- **Primary buttons:** dark pill (ink background, ivory text), like the inspiration.
- **Status colours (muted, not neon):** on-time green `#5E8F6B`, amber `#C98A2B`, red `#B5483A`.
- **Fonts:** Fraunces (headings), Inter (body), Noto Sans Devanagari / Tamil / Bengali for those languages.
- **Shapes:** big soft corners, thin 1px warm borders, subtle paper grain. Cards should look like tickets, tags, stamps or polaroids where it makes sense, not identical rounded rectangles.
- **Motion (Framer Motion, keep it light):** passport opening on first launch, stamp "thump" when a step completes, plane moving along a dotted line on the flight card, red ripple when a delay cascades. No layout jumps.
- **Mobile first:** design at 390px wide. Bottom nav, big tap targets (min 48px), one primary action per screen. Senior mode: 1.25x text, 56px buttons.
- Put all colours, fonts, radii and spacing in one place (`src/design/tokens.ts` + Tailwind config). Never hard-code a colour inside a component.

## 4. Rough layout

### Bottom navigation (5 tabs)
`Home` | `Trips` | `Assistant` (centre, raised button) | `Wallet` (documents) | `Me`

### Screens
1. **Splash / passport-opening** -> **Login** (phone or email) -> **OTP** (demo code 123456, clearly labelled "Demo sign-in") -> **Set password** (first time only).
2. **Persona quiz** (6 short questions: style, interests, pace, budget, food, mix). Result reshapes the app (text size, wording, suggestions). Also feeds the itinerary.
3. **Home**
   - greeting + online/offline chip (ON-DEVICE / CLOUD)
   - "Next flight" boarding-pass card with a green/amber/red connection-risk badge
   - pastel tile grid: Existing Trips, New Trip, Completed Trips (stamp collection)
4. **Trips list** (Existing / Completed tabs). Completed trips show stamps, memories, expenses.
5. **Trip workspace** (one per trip, data never shared between trips). Pastel tiles for the 8 modules: Flights, Documents, Transportation, Accommodation, Budget, Experiences, Itinerary, Restaurants & Cafes. **Start Trip** button at the bottom.
6. **Module screens:** each opens its own screen. For the prototype they use bundled sample data and are labelled "sample data".
7. **Active-trip mode** (after Start Trip)
   - vertical timeline: leave home -> airport -> check-in -> bag drop -> security -> gate -> boarding
   - manual "Done" confirmation per step (we cannot detect physical steps)
   - FIVE big emergency buttons: Connecting flight, Flight delay, Preponed flight, Layover help, Missed flight
8. **Disruption screen** (the hero screen)
   - top: red ripple cascade timeline showing what breaks (connection, hotel, cab, family)
   - middle: 3-4 ranked options, each with true cost, time lost, one-line "why"
   - bottom: "Recheck" -> shows old vs new price/availability -> **Confirm** (nothing is applied before this)
9. **Assistant** (type or voice, Hinglish works) -> opens the right flow.
10. **Wallet** (documents): searchable list, PDF viewer, scan-to-PDF, "available offline" toggle.
11. **Family pickup page** (public read-only link) showing live "leave home at" time.
12. **Judge Mode** (hidden behind a long-press on the logo): 4 disaster buttons + reset.

## 5. Technical approach (decisions already made, do not re-debate)

- Vite + React + TypeScript + Tailwind + Framer Motion + react-router-dom + vite-plugin-pwa + Dexie (IndexedDB) + Fuse.js + lucide-react.
- Hosting: Vercel. One serverless function in `/api` that calls Gemini, so the API key is never in the browser.
- Not Flutter, not Next.js, not a big backend. Skip the "compare frameworks" step.
- Folder rule: UI in `src/screens` and `src/components`; pure logic in `src/engines`; storage in `src/db`; AI calls in `src/ai`; translations in `src/i18n`; sample data in `src/data`. UI never contains business logic.

### What runs where (PS requirement: balance on-device and cloud)

| Capability | Runs | Offline? |
|---|---|---|
| Disruption cascade, connection-risk badge | On-device (plain code) | Yes |
| True Journey Cost + ranking | On-device (plain code) | Yes |
| Trip, documents, boarding pass, checklist | On-device (Dexie) | Yes |
| Airports + terminal guide | On-device (bundled JSON) | Yes |
| Phrasebook + read-aloud | On-device (Fuse.js + speech synthesis) | Yes |
| Hinglish intent (fallback) | On-device keyword matcher | Yes |
| Hinglish intent (smart) | Cloud (Gemini via `/api`) | No, falls back |
| Friendly wording of options | Cloud (Gemini), cached | No, falls back to templates |
| Email/SMS paste -> trip | Cloud (Gemini) | No, sample fallback |
| Weather, share link, live pickup page | Cloud | No |

Every screen shows a small chip: ON-DEVICE or CLOUD. Rule for AI: code decides, AI only rewrites wording. Every AI call has a timeout, a cache and a non-AI fallback.

### Honesty rules (important, judges will probe)
- Never claim a booking was changed unless a "provider confirmation" exists. In this prototype we show **suggestions** and label simulated confirmations as simulated.
- Cached data shows "Last synced: <time>". Live data shows "Live". Never mix them up.
- Offline changes go into a queue with an idempotency key and replay when online. If a conflict happens, ask the user which version to keep.
- Say which actions need internet.
- Demo sign-in is labelled as demo. Production would use a real auth provider (Supabase Auth or Firebase Auth).
- All flight/hotel/price data is bundled sample data and labelled as such.

### Data model (one source of truth)
User, Trip, Flight (legs), Booking, Document, Accommodation, TransportBooking, Experience, Restaurant, ItineraryDay, ItineraryItem, Expense, TravellerPreferences, FlightStatus, SyncQueue. Every record has `tripId`. Store locally in Dexie; sample "backend" is mock data plus the one `/api` function.

## 6. Inspiration repos: ideas only, do NOT copy code

Licences: TREK is AGPL-3.0 and AdventureLog is GPL-3.0. Copying their code into our app could force us to open-source ours under the same licence. Their stacks (NestJS+SQLite+Docker, SvelteKit+Django) are also different from ours. So:

- Clone them OUTSIDE our project folder, for reading only (see section 7).
- Read, understand the idea, close the file, write our own version from scratch.
- Never paste their code, file names or text into our repo.

What to take as an idea, and from where:
- **TREK** (`client/`, `server/`, wiki): offline pattern: precached app shell, IndexedDB trip store, offline write queue replayed with an idempotency key, stale edits held for the user to choose. Also: 4,000+ bundled airports for local times, multi-language setup, packing list structure.
- **TourMind Booking Skills** (MIT licence): idea only: "re-check live price and availability, show what changed, apply nothing until the user confirms". It needs a TourMind account token and is a hotel-booking skill for AI clients, so we do not install it.
- **AdventureLog:** idea only: read-only share link, calendar-style itinerary view.

For airport data, use a public-domain dataset (OurAirports) trimmed to about 100 Indian and major hub airports, not a copy of TREK's file.

## 7. How to work (rules for Claude Code)

- Tell me what you are about to do in one sentence, then do it.
- Keep changes small. One goal per session. Commit after each working step, with a clear message.
- After any visual change: run the dev server, open it at 390px width, take a screenshot, and fix obvious issues before saying you are done.
- Never put API keys in code. Use `.env.local` (git-ignored) and Vercel environment variables.
- If something is unclear, make a sensible choice, say what you chose, and carry on.
- Teammates own folders: do not edit files outside the folder you were asked to work on unless necessary, and say so when you do.

## 8. Added feature: loyalty points (agreed after planning)

- A points pill in the top-right of the TopBar on every in-app screen (hidden on onboarding, family pickup page and Judge Mode).
- Points = 3% of total spend on confirmed bookings made through the app, rounded down (₹12,400 -> 372 pts). Manual Budget expenses and unconfirmed suggestions do not count.
- Logic in `src/engines/loyalty.ts` (pure, offline). Tapping the pill opens a breakdown sheet labelled "Sample points, not redeemable".
