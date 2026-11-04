# WI-MOB-002: allergens and "Signed in as" in the Android app, Maestro run, 2026-11-04

> **Status:** Snapshot · 2026-11-04 · one local run on the lead's Windows machine, after several runs that failed; not a pipeline result.
>
> **Current result:** `node scripts/dev/mobile-flows.mjs` from a cold start passed **7 of 7 flows**, exit code 0, 255 s of flow time, with a fresh build of the app; after the control server was hardened (below) the flows were run again with the same app and passed **7 of 7** again (257 s). The same flows failed in three earlier runs the same day for the reasons below, and none of the allergen paths has been exercised beyond what the three new flows do (see "Not run").

## What ran

The one command: it booted the emulator `bakery_pixel`, started the stack (Compose, seed, catalog, ordering, the BFF with `ENABLE_TEST_HOOKS=1`), started the runner's **flow-control server** (`scripts/lib/flow-control.mjs`, `127.0.0.1:4199`), built and installed the test build, ran seven flows and tore everything down. The JUnit file is `maestro-junit-2026-11-04.xml` here. The first four flows are those of `WI-MOB-001` (`docs/evidence/WI-MOB-001/`), which still pass; flows 05 to 07 are new, and flow 01 now also asserts the signed-in name.

| Flow | Result | What it proves |
|---|---|---|
| `01-login-and-logout` | passed (34 s) | As before, and now "Signed in as Alice Customer" shows after login **and after a restart without a new login** (the name is read again from the renewed session) |
| `02-browse-to-detail` | passed (23 s) | as in `WI-MOB-001` |
| `03-order-journey` | passed (38 s) | as in `WI-MOB-001` |
| `04-declined-payment` | passed (38 s) | as in `WI-MOB-001` |
| `05-allergy-warning` | passed (46 s) | Alice with a saved **tree-nut allergy**; Almond Croissant with the option "Extra almonds". The cart says what the item and the option contain. Checkout shows **two** warnings (the item, and the option by name), the reminder, the acknowledgement box with its hint, and "Tell the bakery" with Tree nuts ticked. **Place order is off** until the box is ticked, on when ticked, off again when unticked. The order is placed, and the BFF reports the newest order carrying exactly `[tree-nut]` (read by the control server, not by the screen) |
| `06-no-allergy-profile` | passed (39 s) | Alice with **no profile**. The cart still lists what Almond Croissant contains, and says "No allergens flagged by the bakery" for Oat Milk Latte (never "free of" anything). Checkout says the order was **not checked** against any allergies, shows no warning, no acknowledgement and no "Tell the bakery"; Place order is on; the order carries **no** allergens |
| `07-allergy-check-failed` | passed (38 s) | Alice with a tree-nut profile; the BFF is **stopped** while checkout opens. The screen says "We could not check this order against your allergies", does **not** say there is no profile, shows no warning, and Place order is on; the BFF is brought back and the order is placed |

Unit tests: `packages/customer-core` has 80 tests (14 new: reading the name from a token, including accents, emoji, markup, control characters, a very long name, malformed tokens and an unsigned token; and turning the profile and the cart check into the checkout's shapes). `node scripts/ci/node-gates.mjs --tests` passes except the generated traceability table, which was regenerated afterwards.

The customer's allergen profile is **not** set by a screen of the app: the flows save it through the BFF (`savePreferences`) by the control server, which signs in as Alice with the app's own flow (authorization code, PKCE S256, the public client, the app's registered redirect). The profile is cleared again at the end of each flow that set it.

## The runs that failed, and why (all 2026-11-04)

| Run | Result | Cause |
|---|---|---|
| 1 (cold, with the allergen code) | 3 of 7 | Flows 05 to 07 failed within about two seconds: the flows' setup scripts reached `http://localhost:4199`, and Maestro resolves `localhost` to IPv6 while the control server listened on `127.0.0.1` only. Flow 03 failed once at the login: Chrome showed the issuer's page but its accessibility tree had the heading and **not the buttons** for 20 s (seen once; not reproduced) |
| 2 | 2 of 7 | The login fallback I had added for that tree problem tapped the app's own menu after the login page was gone (both branches ran), breaking flows 03 and 04. The control server was still unreachable: the runner started Maestro with a blocking call, so the server in the same process could not answer. Both are errors in the test tooling |
| 3 | 6 of 7 | Flow 05 failed at the hint "Tick the box": it was **below the screen**, under the pickup times, beside Place order. That is a usability problem as well as a test one, so the hint moved next to the checkbox and the flow scrolls to the button |
| 4 | no result | Killed by Claude Code during the Gradle build because the machine was critically low on memory; nothing ran |
| 5 | **7 of 7** | The result above |

So the passing run is the first in which every flow passed, after the tooling and the screen were changed. No flow was deliberately broken to prove it can fail; flow 05 did fail on a real assertion in run 3, and flow 03 on the login in run 1, which shows those assertions are live, not that every assertion is.

## The control server, hardened after the first passing run (same day)

Re-reading `scripts/lib/flow-control.mjs` showed it had no protection against a **web page in a browser**: while a run is active, a cross-origin "simple" POST needs no preflight and the server would have acted on it (stopped the BFF, rewritten Alice's mock profile). It now refuses, with 403 and before touching the issuer, the BFF or the processes, any request that carries an `Origin` header, lacks the header `x-flow-control: 1` (the Maestro scripts send it), or whose `Host` is not `127.0.0.1` on the server's own port (DNS rebinding). It still has no password, so another program running as the same user can call it while a run lasts.

- **Tests:** `scripts/ci/tests/flow-control.test.mjs` (8 tests, fake issuer, BFF and stack, no emulator): the PKCE sign-in and `savePreferences` with Alice's bearer token and only the two lists, the newest order, stop and start of the BFF, and each refusal reaching nothing. With the guard replaced by `false`, 4 of the 8 fail (the four refusal tests); restored, all 8 pass. Each of the three conditions was not mutated on its own.
- **The flows were re-run** after the change, from a cold start with `--no-build` (the app was unchanged): 7 of 7 passed, 4 m 17 s, and the run's log contains no refusal. The JUnit file is `maestro-junit-2026-11-04-hardened.xml`.

## Versions

As in `docs/evidence/WI-MOB-001/maestro-flows-2026-11-04.md` (Maestro 2.12.1, `bakery_pixel` Android 35 x86_64, Expo SDK 58, React Native 0.88.1, Node 25.9.0, .NET 10, Docker 29.1.3), on the same machine.

## Not run, and what the result does not show

- **Only the tree-nut allergy and one item.** No `AVOID`-only conflict (a note, no acknowledgement), no profile with several allergies, no unticking of an allergy under "Tell the bakery" (so no test that the order then carries fewer allergens), and no conflict that comes only from an option (the seed's only such item, the Blueberry Oat Muffin, is sold out).
- **Not covered:** the session ending during checkout, a check that fails after the profile loaded, an order screen showing what was told to the bakery (the web does not either), the diet preferences and the marks on the menu and the detail screen (out of scope, `CUST-006`), and a stale answer when the cart changes while the check is running.
- **Nothing about accessibility:** whether a screen reader announces the warnings, the checkbox and the disabled button correctly, large text, or dark mode was not checked. The warning's colour is not the only signal (the heading "Allergy warning" and the symbol carry it), by construction rather than test.
- **One emulator image, one machine, one passing run**, and the login page's tree problem was seen once in five runs, so a failure at the login on another run is possible. The login subflow now falls back to tapping where the first button is when the button is not in the tree; whether that fallback ran in the passing run was not checked.
- **When the check fails nothing is told to the bakery:** with the profile unreadable the app cannot know which allergens to send, so the order carries none (the web behaves the same). Flow 07 does not assert this.
- **The lead approved the wording** of the warnings, the "no profile" text and the rest of the allergy text on 2026-11-04, after these runs and on reading the spec and the summary; the evidence for that is the lead's statement in the session, not a recorded review of the screens. The lead's review of the control server's use of the sign-in flow is still pending.
- Local only: not in the pipeline, the flows only work when started by `scripts/dev/mobile-flows.mjs` (the control server), the app is a test build and the BFF has its test hook on.
