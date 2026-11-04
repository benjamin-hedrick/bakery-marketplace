# WI-MOB-002: allergens and "Signed in as" in the Android app, Maestro runs, 2026-11-04

> **Status:** Snapshot · 2026-11-04 · local runs on the lead's Windows machine, several of which failed on the way; not a pipeline result.
>
> **Current result:** `node scripts/dev/mobile-flows.mjs --no-build` from a cold start passed **10 of 10 flows**, exit code 0, 405 s of flow time (6 m 45 s), against customers whose saved allergen profiles are **seed data**. Single run on a single emulator image with a test build; see "Not run". An earlier 7-flow version of this suite, which set Alice's profile at run time through a side server, also passed (twice) and was then replaced on the lead's instruction (below).

## What ran

The one command: it syntax-checks every flow, boots the emulator `bakery_pixel`, starts the stack (Compose, the **seed, which now also writes four customers' saved allergen profiles**, catalog, ordering, the BFF with `ENABLE_TEST_HOOKS=1`), starts the runner's flow-control server (`scripts/lib/flow-control.mjs`, `127.0.0.1:4199`), installs the test build, runs ten flows and tears everything down. The JUnit file is `maestro-junit-2026-11-04-seeded-customers.xml` here. The app was the same build as in the earlier runs (no app change since); `--no-build` reuses it.

Test state is seed data, by the lead's rule (`CLAUDE.md`: don't build functionality only to close a gap in testing). The seed tool writes a saved profile for four mock customers into the catalog's `preferences` container; Alice has none. The identities are rows in `MockUsers` (identity only, no logic). The table of customers is in `docs/operations/local-dev.md`.

| Flow | Customer | Result | What it proves |
|---|---|---|---|
| `01-login-and-logout` | Alice | passed (40 s) | login through the real issuer, "Signed in as Alice Customer" after login and after a restart, restart without login, logout |
| `02-browse-to-detail` | Alice | passed (24 s) | as in `WI-MOB-001` |
| `03-order-journey` | Alice | passed (40 s) | as in `WI-MOB-001` |
| `04-declined-payment` | Alice | passed (40 s) | as in `WI-MOB-001` |
| `05-allergy-warning` | **Nora** (tree-nut allergy) | passed (47 s) | Almond Croissant with "Extra almonds": the cart says what the item and the option contain; checkout shows **two** warnings (the item, and the option by name), the reminder, the acknowledgement box with its hint, "Tell the bakery" with Tree nuts ticked; Place order **off** until the box is ticked, on when ticked, off again when unticked; the order is placed and the BFF reports it carrying exactly `[tree-nut]` |
| `06-no-allergy-profile` | Alice | passed (43 s) | no profile: the cart lists what the Country Sourdough contains and says "No allergens flagged by the bakery" for the Oat Milk Latte; checkout says the order was **not checked** against any allergies, no warning, no acknowledgement, no "Tell the bakery"; Place order is on; the order carries **no** allergens |
| `07-allergy-check-failed` | **Nora** | passed (40 s) | the BFF is **stopped** while checkout opens: the screen says "We could not check this order against your allergies", does **not** say there is no profile, shows no warning, Place order is on; the BFF is brought back and the order is placed |
| `08-sesame-option-only` | **Sam** (sesame allergy) | passed (55 s) | an allergy that **only an option carries**: the plain Country Sourdough raises no warning (the reminder and "Tell the bakery" are there, no acknowledgement, Place order on); adding "Add seeds" (a second line) makes the check run again and raises a warning that names the option, which must be acknowledged; the order carries `[sesame]` |
| `09-avoid-only` | **Dana** (avoids dairy) | passed (34 s) | a preference, not an allergy: the Lemon Loaf shows "You avoid this: ... contains milk (dairy), which you avoid", no "Allergy warning" anywhere, no acknowledgement, no "Tell the bakery", Place order on; the order carries **no** allergens |
| `10-several-allergies` | **Max** (dairy and tree-nut allergies, avoids gluten) | passed (42 s) | the Almond Croissant with "Extra almonds": four warnings (dairy; tree nuts for the item and for the option; and a note for gluten); both allergies are offered under "Tell the bakery", ticked; Max unticks **dairy**, acknowledges, orders, and the order carries only `[tree-nut]` |

Checks behind the flows (all passing at the time of the final run, except where stated):
- `packages/customer-core`: 80 unit tests (14 new: the name from a token; the profile and cart-check shapes).
- `SeedCustomerProfilesTests` (catalog, 10 new tests): the profiles are written once under the customer's id, re-seeding changes nothing and keeps a profile edited in between, every seeded profile belongs to a mock customer and every mock customer but Alice has one, and **each profile produces its intended conflict under the catalog's real rules** (`ConflictMatcher`): tree nut on item and option, sesame only through an option, dairy as an avoid only, several at once. The Auth (194), catalog (301) and notification (44) suites pass; `dotnet format` whitespace and style are clean. The Linux check of the C# changes has **not** been run yet.
- `scripts/ci/tests/flow-control.test.mjs` (10 tests, fake issuer, BFF and stack): the PKCE sign-in as the customer asked for, the newest order, stop and start of the BFF, only mock customers can be asked for, the profile endpoint is gone (404), and every request that is not a flow's own call is refused before anything is reached (with the guard disabled, 4 of them fail).
- The runner now runs Maestro's `check-syntax` on every flow and subflow before anything starts (a deliberately broken flow was refused in 5 s).

## The profile used to be set at run time; the lead had that replaced

The first version of these flows set Alice's profile through a side server (a `/profile` endpoint that signed in as Alice and called `savePreferences`), because the seed had one customer. The lead objected that a profile is persisted customer data and belongs in seed data, not in something a flow changes at run time, asked whether the endpoint was built only to close a test gap (it was), and asked for a collaboration note (now in `CLAUDE.md`) and for several customers in the seed to cover the cases. The endpoint and its script were removed; what remains of the control server (read a customer's newest order, stop and start the BFF) is on the review list (register 150).

## The runs that failed, and why (all 2026-11-04)

| Run | Result | Cause |
|---|---|---|
| 1 (cold, setting the profile at run time) | 3 of 7 | The setup scripts reached `http://localhost:4199` and Maestro resolves `localhost` to IPv6 while the server listened on `127.0.0.1` only. Flow 03 failed once at the login: Chrome showed the issuer's page but its accessibility tree had the heading and **not the buttons** for 20 s (seen once, never reproduced) |
| 2 | 2 of 7 | My login fallback tapped the app's own menu after the login page had gone (both branches ran); the control server was unreachable because the runner started Maestro with a blocking call. Both errors in the test tooling |
| 3 | 6 of 7 | The acknowledgement hint was below the screen, under the pickup times; it moved next to the checkbox (a usability fix) |
| 4 | no result | Killed by Claude Code during the Gradle build for low memory |
| 5 | 7 of 7 | The profile was still set at run time; passed again after the control server was hardened (browser pages refused) |
| 6 (seeded customers) | no flow ran | A YAML error of mine in the login subflow (an unquoted `: ` in a script line) and another in flow 10's name stopped Maestro at parsing; the JUnit file in the folder was the old run's. The runner now syntax-checks first |
| 7 | 9 of 10 | Flow 10 found the Almond Croissant **sold out**: the flows of a run share one stack and flows 05, 06, 07 and 09 had each bought one of its 4 units. Fixed in the flows, not the stock (the croissant's "low stock" is relied on elsewhere): only flows 05 and 10, which need tree nuts, use the croissant; 06 uses the sourdough and the latte, 07 the latte, 09 the Lemon Loaf. Flow 07's duration in this run, 28 m 53 s, was the laptop in **Modern Standby** (the Windows power log shows entry at 17:56:58 and exit at 18:25:27); the flow passed |
| 8 | **10 of 10** | The result above |

So the passing run is the first in which all ten passed, after the tooling, one screen and the flows were changed. No flow was deliberately broken to prove it can fail; flows 03, 05 and 10 failed on real assertions in earlier runs, which shows those assertions are live, not that every assertion is.

## Versions

As in `docs/evidence/WI-MOB-001/maestro-flows-2026-11-04.md` (Maestro 2.12.1, `bakery_pixel` Android 35 x86_64, Expo SDK 58, React Native 0.88.1, Node 25.9.0, .NET 10, Docker 29.1.3), on the same machine.

## Not run, and what the result does not show

- **Now covered** (they were "not run" before the seeded customers): an `AVOID`-only conflict, several allergies, unticking an allergy under "Tell the bakery" (so the order carries fewer allergens), and a conflict that comes only from an option.
- **Still not covered:** the session ending during checkout, a check that fails *after* the profile loaded, an order screen showing what was told to the bakery (the web does not either), diet preferences and the marks on the menu and the detail screen (out of scope, `CUST-006`), a stale answer when the cart changes while the check is running (flow 08 covers the cart changing between screens, not during a read), and a customer who is not a customer (FORBIDDEN).
- **Nothing about accessibility:** whether a screen reader announces the warnings, the checkbox and the disabled button correctly, large text, or dark mode was not checked. The warning's colour is not the only signal (the heading and the symbol carry it), by construction rather than test.
- **One emulator image, one machine, one passing run**, and the login page's tree problem was seen once. The login subflow falls back to tapping where that user's button is when the button is not in the tree (a position computed from the user's row in the issuer's list); whether that fallback ran in the passing run was not checked, and the positions for rows 1 to 4 were computed, not each tried.
- **When the check fails nothing is told to the bakery:** with the profile unreadable the app cannot know which allergens to send, so the order carries none (the web behaves the same). Flow 07 does not assert this.
- **The lead approved the wording** of the warnings, the "no profile" text and the rest of the allergy text on 2026-11-04, after the first passing run; the evidence is the lead's statement in the session, not a recorded review of the screens. The lead's review of the control server is on the list (register 150).
- **Stock budget:** flows share a stack, so a new flow that buys the croissant can fail the existing ones; the budget is written in the app's README. Keep the machine awake during a run.
- Local only: not in the pipeline, the flows that call the control server only work when started by `scripts/dev/mobile-flows.mjs`, the app is a test build and the BFF has its test hook on.
