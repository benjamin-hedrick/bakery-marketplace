# Fresh-clone run (2026-10-30)

> **Status:** Snapshot · 2026-10-30, `main` at `aa75d79`, cloned from GitHub into an empty folder. Step 5 of the public-readiness pass (register item 93). **Current result:** the README's one-command path works from a clean clone: dependencies install, the real stack starts, 21 of 21 browser journeys pass, and everything is torn down. Run on Windows 11 with Docker Desktop, Node 25.9.0 and .NET SDK 10.0.401.

## What was run

`git clone` of the repository, then, from the clone root: `npm ci` in `services/graphql-bff` and in `apps/web-customer`, `npx playwright install chromium`, and `node scripts/ci/skeleton-smoke.mjs` (creates the local secrets, starts Compose with Redis Streams, the Cosmos emulator and the mock issuer, seeds, starts catalog-service, ordering-service, the BFF and Next.js, runs the Playwright suite, tears everything down).

| Step | Elapsed (cumulative) |
|---|---|
| `npm ci` (BFF) | 0 s to 5 s |
| `npm ci` (web app) | 5 s to 43 s |
| Playwright Chromium (already cached on this machine) | 43 s to 44 s |
| Skeleton smoke: build, start, 21 tests (17.2 s of test time), teardown | 44 s to 112 s |

Result: exit 0; 21 passed; no containers left after teardown. Image pulls and NuGet restores were already cached on this machine, so a first run on a new machine will take longer.

## Observations

- The .NET build prints analyzer warnings (CA1510, CA1000, CA1001, CA1305; 48 warning lines in the log). The build passes; the repository's code analysis is not warning-free.
- After teardown the log shows `catalog exited (1)` and the same for ordering, the BFF and the web app: these are the stop signal reaching each process, not failures (the smoke script logs every exit, and the test run had already finished with exit 0).
- Not covered: the manual step-by-step path in `docs/operations/local-dev.md` (verified separately in a fresh clone earlier on 2026-10-30), Linux and macOS, and a machine with nothing cached.
