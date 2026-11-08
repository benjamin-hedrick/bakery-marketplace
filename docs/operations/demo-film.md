# Demo film: three screens, one live system

> **Status:** Current · scripted 2026-11-07 (register 163), run and composed 2026-11-08. The film is in the repository: [`docs/operations/demo/demo-film.mp4`](demo/demo-film.mp4), 104 seconds, a web customer, a phone customer and the bakery's live queue on one screen, local, test payments. This page says what the film shows, how the scripts work, what happened on the first runs and what is not proven.

## What it is for

A short video of the slice running, watchable without starting anything: a **web customer**, a **phone customer** and the **bakery's live queue** on one screen, with several customers' orders flowing in at the same time and every screen showing the changes as they happen. Paced for a viewer (several seconds between steps, not realistic timings). Kept local for the lead's review; where it is published is the lead's decision (register item 93).

## Length

No fixed length. About ten to twelve beats of five or six seconds each is about two minutes; the cap is two and a half minutes. A beat that does not teach the viewer something is cut.

## Storyboard

The cast is seeded data. Nora (tree-nut allergy) is on the web, Max (dairy and tree-nut allergies, avoids gluten) is on the phone, and three other customers order in the background: Alice (no profile), Dana (avoids dairy), Sam (sesame allergy). All order from Corner Bakery, the vendor whose queue is shown.

| # | Beat | What the viewer sees | Caption (a viewer's wording) |
|---|---|---|---|
| 1 | Start | The queue is empty. The web app shows the listings; the phone shows the app's splash and sign-in screen. | "Corner Bakery's live queue: nothing yet" |
| 2 | Web, allergy | Nora opens the Almond Croissant, chooses Extra almonds, adds it, logs in at the issuer's page. Checkout names the tree-nut warning for the item and for the option and holds "Place test order" until she ticks "I have read this". She orders. | "Nora has a tree-nut allergy and is ordering on the web" |
| 3 | Phone, allergy | Max signs in, opens the same croissant with Extra almonds, sees warnings for dairy, tree nuts and a note for gluten, ticks the acknowledgement and orders. | "Both customers are warned about their allergies and must acknowledge them" |
| 4 | Orders arrive | Both orders appear on the queue within a second. | |
| 5 | Others order | A plain latte order from Alice confirms itself; Dana's sourdough with a pickup time waits for the bakery; Sam's sourdough with the seeds option carries a "sesame" allergy on its card. | "More customers order at the same time", "A pickup time waits for the bakery to accept", "An allergy told to the bakery shows on its card" |
| 6 | The bakery works | The vendor agent accepts, starts, marks ready and hands over, about five seconds apart (newest orders first, so the two customers on screen are worked first). The web order page and the phone follow each step. | "The bakery works its queue; each customer sees every step" |
| 7 | A cancel | Max cancels while his order still shows "Order received" (about four seconds after ordering, before the bakery has accepted it); his card leaves the queue. | |
| 8 | Done | Everything else is handed over and shows as picked up. | "Local demo: test payments" |

Pickup-time and option orders wait for the bakery; plain orders confirm themselves (WI-ORD-008). The background orders are placed through the BFF with each customer's own token, the same request the apps send. Stock used: the croissant has 4 units (Nora 1, Max 1), the latte is made to order, the sourdough has 12.

## How it works

| Piece | What it is |
|---|---|
| `scripts/dev/film/film.mjs` | The director. Starts Docker, the services, the web app, the queue display and the emulator; brings the Android app to its first screen; **then** starts the phone recorder (the film begins on the app, not on Android). Records two browser contexts with Playwright (1280×720) and runs four actors in parallel: the vendor agent, Nora, Max (a Maestro flow) and the background customers. Writes `timeline.json` (when each recording started, the beats, the captions). `--dry-run` checks tools, ports and files and prints the plan. |
| `scripts/dev/film/record-phone.mjs` | Records the emulator in chunks with `adb screenrecord`; started and stopped by the director. |
| `apps/mobile-customer/.maestro/demo/phone-max.yaml` | Max's paced flow. Not a test. It calls the director (`scripts/film-call.js`) for its pauses and to say "phone-ready", "phone-ordered" and "phone-cancelled"; the director releases it with "go-phone" when the recording rolls. |
| `scripts/dev/film/compose.mjs` | Puts the recordings on one timeline and makes one 1920×1080 MP4: the queue and the web customer stacked on the left, the captions in the middle, the phone on the right. `--selftest` composes synthetic recordings. |
| Output | `artifacts/film/run-<time>/` (git-ignored): `timeline.json`, `video/`, `phone/`, `film.mp4`, `poster.png`. The one film chosen for the repository is copied to `docs/operations/demo/demo-film.mp4`; the raw recordings stay out of git. |

The vendor agent needs no knowledge of the other actors: it acts on any order that has been in the queue for 7 seconds, six seconds between the steps of one order and five between any two actions; a new order is accepted before the others are moved along, then the newest order first. Once the web order is completed and the phone order cancelled, the rest of the queue goes at two seconds a step. The run ends when the web customer's order shows Completed and the background orders are in, plus a hold for the viewer; there is a four-minute hard limit.

## Checked and not checked (the position of 2026-11-07, before the first run)

This table was written before the film was run; the film was run, composed and committed on 2026-11-08 (see "Where it ended up" below). It is kept as the record of what was known on 2026-11-07.

| Checked (2026-11-07) | Not checked |
|---|---|
| ffmpeg installed (9.0.2, winget). Phone recording with `adb screenrecord` works (540×1200, chunks, 35 fps when the screen changes). The compositor makes the three-pane layout with captions from synthetic recordings (`compose.mjs --selftest`). `film.mjs --dry-run` and the Maestro flow's syntax pass. Flows 11, 13-cancel-order and 13-no-payment-methods passed with the recorder running. | Everything the director does: the login steps, the selectors, the timings, the hand-offs between the director and Maestro, the vendor agent against the real queue, the background orders, the teardown order. Whether the real recordings line up (sync accuracy is not measured). Whether the film is two and a half minutes or less. How much memory all of it needs at once (the machine was low on memory once on 2026-11-07 when the flows ran). |

## Things found by the spike that the scripts already handle

- `screenrecord` writes a frame only when the screen changes, so a still period leaves the file shorter than the wall clock; `compose.mjs` pads each chunk to its wall-clock length (register 163).
- It stops after 3 minutes, so the recorder writes chunks (about a second can be lost between two).
- The last chunk is only pulled after it ends: the director stops the recorder and waits for it **before** stopping the emulator.
- Early recordings failed while Android was still starting: the director starts the recorder after the app is on its first screen.

## First runs, in order

1. `node scripts/dev/film/film.mjs --dry-run`, then `node scripts/dev/film/compose.mjs --selftest` (cheap, no stack).
2. `node scripts/dev/film/film.mjs --no-phone`: the web customer and the queue only (lighter on memory). Check the selectors, the vendor agent and the timings; fix and repeat until it finishes by itself.
3. The same with the phone: `node scripts/dev/film/film.mjs --no-build` (the app is already installed on the emulator image; use no flag the first time). Fix the Maestro hand-offs.
4. `node scripts/dev/film/compose.mjs --run artifacts/film/run-<time>`; look at it; measure the sync (a visible event on two screens, such as an order appearing on the queue and on the phone's status).
5. Polish: caption wording, title and end cards, layout, length. Decide where it lives.

**Where it ended up (2026-11-08).** All five steps were done: the `--no-phone` run twice, the full run with the phone four times, each composed and checked. What the runs found and fixed: the director deleted its own log folder at the start; it ended while the vendor was still working the queue; a label covered the vendor page's heading and another the phone's clock; captions overlapped and were held too long; and the phone's cancel lost a race with the vendor (see the risks below). The pacing was then tightened (shorter phone pauses, other customers' orders arriving while the phone signs in, captions re-timed, the vendor faster at the end) and the film starts when all three recordings are running. The lead watched the 104-second result and chose it; it is copied to `docs/operations/demo/demo-film.mp4` (1.9 MB, committed), made from the run of 2026-11-08T16-57-07. Sync between the screens was read off one event (the cancellation: the phone showed it about half a second before the card left the queue) and not measured more finely; the lead's own run on a cold machine is not done.

## Known risks and choices

- Memory: Docker, the Cosmos emulator, the emulator, three Node apps and two Chromium contexts at once. Close other applications first; run step 2 before step 3.
- A race in the story, hit on 2026-11-08: the first version had Max wait for "Order confirmed" before cancelling. The phone only shows the confirmation some seconds after the vendor accepts, and once the vendor agent works the newest orders first it had already started preparing (which a customer can no longer cancel after) by then: the cancel was refused and the flow failed. Max now cancels while the order is still "Order received"; the vendor agent does not touch a new order for 7 s, and a customer can cancel until preparation starts.
- The vendor's login and the first page load are not filmed (a stored login is reused for the recorded browser).
- Nothing is faked: the data is the seed, the services are the real ones, the payment is the test stub. The end caption says so.
