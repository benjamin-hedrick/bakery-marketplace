# WI-MOB-002: the allergen flows on their own seed listings, all fifteen Android flows, 2026-11-17

> **Status:** Snapshot · 2026-11-17 · one local run on the lead's Windows machine; not a pipeline result.
>
> **Current result:** `node scripts/dev/mobile-flows.mjs` from a cold start (no emulator, no containers, no stack, a fresh build) passed **15 of 15 flows**, exit code 0, 586 s of flow time (9 m 46 s). Flows 05 and 10 now buy listings of their own (register 200). Single run, single emulator image, a test build; see "Not run".

## What changed

Register 200: flows 05 (Nora, a tree-nut allergy) and 10 (Max, allergies to dairy and tree nuts, an avoid for gluten) both bought the Almond Croissant, which has 4 units, and shared them by a budget written in the flows. Following working rule 6 of [`docs/testing.md`](../../testing.md) (a test that needs something no other test may touch gets a new named seed data point), the seed now has two listings, each used by one flow only, both made to order so they never run out:

| Listing | Id | Allergens | Option | Flow |
|---|---|---|---|---|
| Walnut Banana Bread | `listing-walnut-banana-bread-001` | gluten, egg, tree-nut | Extra walnuts (tree-nut) | 05 |
| Walnut Danish | `listing-walnut-danish-001` | gluten, dairy, tree-nut | Extra walnuts (tree-nut) | 10 |

Each gives its flow the same case the croissant gave: Nora gets a tree-nut warning for the item and one for the option; Max gets four (dairy and tree nuts on the item, tree nuts on the option as allergies, gluten as an avoid). The ids sort after the sourdough, and browse is ordered by id, so the new listings come last and the listings the other flows open keep their places; flows 05 and 10 scroll to theirs. No Android flow buys the croissant any more. Nothing in the app changed.

## What ran

The one command, as in the earlier records: syntax check of every flow, the emulator `bakery_pixel` booted, the local stack started (Compose infrastructure, the seed, catalog, ordering, the BFF), `adb reverse` for 5100 and 4100, the runner's flow-control server, `expo prebuild` and a Gradle debug build, the APK installed, the fifteen flows, teardown. The run was started from a PowerShell process holding `SetThreadExecutionState` (system and display required) so the machine could not go to standby. The JUnit file is [`maestro-junit-2026-11-17-own-listings.xml`](maestro-junit-2026-11-17-own-listings.xml).

| Flow (`apps/mobile-customer/.maestro/`) | Result | Time |
|---|---|---|
| `01-login-and-logout` | passed | 38.9 s |
| `02-browse-to-detail` | passed | 24.2 s |
| `03-order-journey` | passed | 37.8 s |
| `04-declined-payment` | passed | 37.7 s |
| `05-allergy-warning` (Walnut Banana Bread) | passed | 55.2 s |
| `06-no-allergy-profile` | passed | 41.3 s |
| `07-allergy-check-failed` | passed | 34.8 s |
| `08-sesame-option-only` | passed | 58.1 s |
| `09-avoid-only` | passed | 33.8 s |
| `10-several-allergies` (Walnut Danish) | passed | 45.4 s |
| `11-failed-checkout-request` | passed | 35.6 s |
| `12-order-edits` | passed | 48.4 s |
| `13-cancel-order` | passed | 40.5 s |
| `14-no-payment-methods` | passed | 27.7 s |
| `15-refused-session` | passed | 26.7 s |

Also run on the same tree: the catalog service tests, which include the seed tests that count from `SeedData` (329 passed, 8 skipped: the Cosmos emulator tests, `COSMOS_CONNECTION_STRING` not set).

## Found on the way

After the flows passed and the stack was torn down, the runner's shell did not exit for over an hour: the Gradle daemon the build started inherited the run's output handle and kept it open. `gradlew --stop` released it and the run returned exit code 0. It does not change a result, but a caller that waits for the runner to exit waits until the daemon's idle timeout.

## Not run

- The web skeleton smoke and the mock-backed browser suites against the new seed. They do not list the seed's listings since register 178 (they name the listings they use), and neither new name contains an existing one, so a filter by name still finds one row; not shown by a run.
- A second run on a kept stack (each run starts from a fresh one).
- The demo film and the screenshots in `docs/operations/demo.md` show the list as it was when they were made, without the new listings.
