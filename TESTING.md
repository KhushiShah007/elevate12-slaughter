# Testing Voyage (Phases 2–11)

Run it: open a terminal in this folder and run `npm.cmd run dev` (PowerShell) or
`npm run dev` (Command Prompt / Git Bash). Open http://localhost:5173.
Use the phone view in your browser's dev tools (about 390 px wide) for the real look.

Only one dev server at a time: the local database (`.data/pglite`) can't be shared.

A ready-made test account is in README.md ("Local test account"), or make your own.

## 1. Accounts (new)
- [ ] Open `/home` while logged out → you are sent to the Welcome screen.
- [ ] Create an account with your mobile or email → a 6-digit code appears on screen
      (no SMS/email service yet) → "Fill the code" → set a password → persona quiz.
- [ ] Try a wrong code → "That code does not match".
- [ ] Me → Sign out → log in again with the password. Try a wrong password first.
- [ ] Login → "Forgot password?" → code → new password.
- [ ] Log in on a second browser (or private window): your name, persona and
      language follow you.

## 2. Trips that save (new)
- [ ] Trips → Plan a new trip. Type a destination (pick from the list), dates,
      travellers, budget. Leave the page halfway, come back → "Picked up your
      unfinished trip".
- [ ] Create trip → it opens the trip and is listed first in My Trips; sample trips
      say "Sample data".
- [ ] Reload, or open in another browser after logging in → the trip is still there.
- [ ] Trip → "Delete trip" at the bottom.
- [ ] New trip → "Paste booking" → paste a confirmation, for example:
      ```
      Your booking is confirmed. PNR: K9TQ2M
      IndiGo flight 6E 5321 BOM to GOI
      Departure 20 Dec 2026, 07:15  Arrival 08:35
      2 Adults
      Total fare paid: Rs 11,480
      ```
      → Read booking → check the fields → Create trip → Flights shows a boarding pass.

## 3. Real photos and Explore (new)
- [ ] Welcome screen collage shows real photos and "53 places".
- [ ] Welcome → "Credits" lists every photographer and licence.
- [ ] Home → Explore: search "beach", "Kerala", "Japan"; India / Abroad filter.
- [ ] Open a destination: photo with credit, description, best time, weather now,
      cost per day (your style highlighted), exchange rate abroad, places to see /
      eat / stay with map links, "Plan a trip to …".
- [ ] Completed trips → Jaipur with Nani: memories show real photos.

## 4. Flights (new)
- [ ] Open your trip → Flights → Find flights. "To" fills in; type a city in "From".
- [ ] Search → airlines on the route, "Indicative", price range, "Save to trip",
      "Check fares" (Google Flights).
- [ ] Trip tile now says "· 1 saved".

## 5. Stays (new)
- [ ] Trip → Accommodation → Search stays → real hotels, estimated price ranges,
      Best rated / Lowest price, Save to trip, Booking.com, Map, Airbnb link.

## 6. Personalisation (new)
- [ ] Retake the quiz (Me → Retake) with different answers, then check:
      Home "Suggested for you", the order in Explore, "For you" places on a
      destination page, veg places first if you chose vegetarian, the budget hint
      on New Trip, and the default stay sort.

## 7. Documents (new)
- [ ] Wallet → Add a document → pick a photo or PDF, choose ID card → Aadhaar, type
      a wrong 12-digit number → error. Leave it empty or use a valid one → only
      "XXXX XXXX 1234" is shown and stored.
- [ ] Open it → it shows the file (via a 5-minute link). Turn "Available offline" on,
      go offline (dev tools → Network → Offline) → it still opens.
- [ ] Scan to PDF → open the scan → "Back up to my account".
- [ ] Delete a document.

## 8. Assistant (fixed)
- [ ] Without an AI key: "show my passport", "Meri flight 2 ghante late hai",
      "Goa ka mausam kaisa hai" → answers with buttons.
- [ ] With a key in `.env.local` (`XAI_API_KEY=` or `GROQ_API_KEY=`), restart the
      dev server → header says "Connected to Grok/Groq" → ask "What trips do I
      have?", "Where can I go in India on a small budget?", "Find me flights from
      Mumbai to Goa on 20 Dec" → answers from your data with buttons; "New chat";
      reload → the conversation comes back.
- [ ] Mic button and the speaker button on a reply (Chrome works best).

## 9. Offline (still works)
- [ ] Dev tools → Network → Offline: the app opens, trips and the wallet work,
      a new trip saves on the phone and syncs when you go back online.

## What is still sample or estimated
- Sign-in codes are shown on screen (no SMS/email service).
- Flight and hotel prices are estimates until Amadeus keys are added.
- The bundled "Kyoto & Tokyo" trip, its flights and sample documents are demo data.
- The AI chat needs an XAI or Groq key.
