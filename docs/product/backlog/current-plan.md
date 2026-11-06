# Current plan

> **Status:** Current · written 2026-10-30, rewritten 2026-11-05 after the Android work was merged. The status of every work item is in `STATUS.md`; this page says what is built, what is happening now and where the next work is listed. Keep it short: update it when the focus changes.

## What is built

Slice 1 is complete and merged: a customer logs in, browses listings with stock, builds a cart, places a test order (the payment is a stub), and watches the order's status. It runs on a developer machine: the Compose infrastructure (Redis Streams, the Cosmos emulator, the mock identity issuer), the catalog and ordering services, the GraphQL BFF and the Next.js customer app. Nothing is deployed. The measured state (test counts, what was run and what was not) is in `docs/evidence/facts-sheet-2026-10-29.md` and `docs/evidence/baseline-2026-10-30.md`; the slice record is `docs/architecture/first-slice-contract.md` and `docs/evidence/slice-1/findings.md`.

Since slice 1 (merged 2026-11-01, local only): the vendor's order read side in the ordering service and BFF (`WI-QUE-001`) and the queue display app, which polls every 7 seconds (`WI-QUE-002`, both Done); and browser sessions (`WI-AUTH-007`, ADR-0019): a server-side session behind an HttpOnly cookie in `packages/web-session`, used by both web apps, with the mock issuer's refresh grant. The real-stack evidence is in `docs/evidence/WI-AUTH-007/findings.md`. `WI-AUTH-007` stays In progress until the lead reviews its security-sensitive phases (the AI pass on 2026-11-02 was a code read; register items 118 to 122 are open from it).

Merged to `main` since (2 to 4 November 2026; all of it local only, nothing deployed; the detail and the evidence are in each item's spec and in `STATUS.md`):

- **Vendor queue and quality** (`WI-QUE-003`, `WI-QUE-004`, `WI-RATE-001`, `WI-SEC-005`): live updates by push (ADR-0021) with polling as the fallback; the vendor accepts, declines, starts, marks ready and hands over from the queue display; first rate limits at the web apps with a backstop at the BFF; browser hardening headers and a limit on GraphQL operation size; a threat model, generated-input tests, a 66-minute soak, an OWASP ZAP scan and a review statement; Firefox, WebKit and phone-profile browser projects (13 failures not diagnosed, register 132). `WI-QUE-003` is Done; the rest are In review.
- **Notifications** (`NOT-001`, `NOT-002`, In review): the notification service consumes the order events in batches and sends through a sender adapter; no real provider.
- **Order history and personalization** (`CUST-007`, ADR-0022, `TAG-001` to `TAG-004`, `PREF-001`, `SRCH-001`, `CUST-005`, `CUST-006`, `CUST-008`, `ORD-009`, `QUE-005`, all In review): the customer's order list; a catalog-owned tag registry with the closed allergen list; an allergen profile; matching and conflicts on browse, detail and cart; the acknowledgement at checkout; allergens recorded on the order and shown to the vendor. Not run on the real stack as a whole: register 139 and 140.
- **Android customer app** (`MOB-001`, `MOB-002`, In review; `MOB-003`, In review on `feature/mobile-session-tests`): an Expo app (Android only, local only, a test build) with sign-in by PKCE, menu, cart, checkout, order status, allergy warnings and "Signed in as", and four seeded customers with saved allergen profiles. Thirteen Maestro flows: ten passed on the `bakery_pixel` emulator on 2026-11-04 and flows 10 to 13 on 2026-11-05; all thirteen in one cold run: not yet. 25 unit tests of the session and API logic run in `npm test` and in the pipeline (the `mobile` job, not yet run on Azure). The Maestro flows stay local (register 148).

Not built: the admin service (a scaffold), the admin web app, a real payment, cloud environments, iOS, any deployed environment.

## What is happening now

**On `feature/mobile-session-tests` (5 commits ahead of `main`, not pushed):** `WI-MOB-003` (unit tests, three flows, In review), the fix of register 151 (a 5xx from the issuer no longer deletes the refresh token; approved by the lead 2026-11-05), the `mobile` pipeline job, and a fix of a race in a web-customer browser test that failed on the pipeline agent. The lead opens the PR.

**Priorities (set 2026-10-29, amended 2026-10-31):** 1. a polished, consistent repository that can be public, showing AI collaboration, architecture and software, and business and project work; 2. it builds and runs locally; 3. more evidence and coverage; 4. deploy and tear down a dev environment; 5. a public demo. On 2026-10-31 the lead made the deployed dev environment, and the ability to tear it down, the next main work, ahead of further product features.

**Waiting on the lead:** the review of the token handling in the Android app and the change for register 151; register 152 (should a retry rejected a second time return to the login screen); register 150 (the test-only tooling of the Android flows, now with an order count and an issuer restart); the four decisions in register item 131 and items 127, 132 and 137; the review of `WI-AUTH-007` (register 118 to 122); the OKR targets and the north-star definition (`WI-PROD-004`); the cold-machine run and a stranger's reading of the demo (`WI-DEMO-001`); the flip-day settings (item 93); and the approvals for the DEV identity work below (ADR-0018, `WI-AUTH-006` phase 2). The first Azure run of the `queue`, `session` and `mobile` jobs is also pending.

**Ready to build, not started:** `CAT-003` and `PORT-004` (the listing cache), `VEN-001` and `VEN-002` (vendor onboarding; the plan keeps vendor onboarding last and the vendor on seeded data).

**Static analysis (2026-11-05):** a local SonarQube Community scan (`node scripts/ci/sonar-scan.mjs`, Docker, C# and TypeScript) ran once: the quality gate passed, but the overall ratings are reliability D and security E; the 276 findings are not triaged (register 153). Running it in the pipeline is an option for later (register 154).

**Open, not scheduled:** the outbox and stock hardening (register 66, 67, 74), a latency budget (100), a dependency audit and SBOM (`WI-SEC-004`), the process-review proposals (register 130: merged as proposals, nothing binding until the lead says so), and the stalled pipeline job of 2026-11-04 (register 144, cause unknown).

**Product order agreed with the lead (2026-11-02; notifications, order history, personalization and the mobile app are done as listed above):** after the quality work, notifications on order events (`NOT-001`, `NOT-002`; built, above), then the customer's order history (`WI-CUST-007`) and personalization, then a mobile spike (`WI-QA-003`). Vendor onboarding (seeded data and the mock identity stay), the admin console and a real payment (design only) come last or are not built for the demo. The deployed dev environment, Azure and Entra stay a separate, parallel track.

**Next, in this order (set 2026-10-31):**

1. Close out the branch: the first Azure run of the `secrets` and `docs` jobs and the cold-machine demo run.
2. `N-02`: Entra registrations and the DEV credential decision (ADR-0018 verification list, `WI-AUTH-006` phase 2). Needs the lead's approval (IAM); start first because it gates the deploy and runs alongside 3.
3. `N-10`: container images and the hosting decision (register items 25 and 71), with a compose profile that runs the whole stack. **Images and the profile are built** (`feature/dev-environment`). The web app's `/api/graphql` is now a run-time API route, so one image serves every environment (latency measured before and after: about 1 to 1.5 ms at p50 on reads; `docs/evidence/WI-DEP-001/web-runtime-config-spike-2026-10-31.md`). The login settings are also served at run time (`GET /api/config`), so the web image contains nothing environment-specific (register item 101, resolved).
4. `WI-DEP-001` part 1: **written and checked locally so far: the foundation stack, the dev environment stack with the mock issuer as the first deployed issuer (2026-10-31; items 102, 108 and 110 are decided, and nothing has been planned or applied on Azure), the destroy guard and a rehearsal pipeline for proving the gates; the gate rehearsal passed on Azure (G1 to G8, 2026-10-31 to 2026-11-01, `docs/evidence/WI-DEP-001/gate-rehearsal-2026-11-01.md`); the next step is yours: run the bootstrap on Azure, with costs from there on** (`docs/operations/runbooks/`). Infrastructure as code in two stacks (a persistent foundation with the registry, and a disposable environment), a deploy stage and a post-deploy smoke test that reuses the Playwright smoke. The design is ADR-0020 (Proposed): build once and promote by digest; plan on pull requests only when `infra/**` changes; separate approvals for infrastructure (skipped when the plan has no changes) and application; state in a storage account.
5. `WI-DEP-001` part 2: a manual, approved teardown run with a runbook (no automatic teardown), with standup time, teardown time and cost recorded and a budget alert. Runbooks to write when each step is first run: bootstrap of the state storage and pipeline identity (with a verify section), create the dev environment, tear it down. The UAT/Prod promotion pipeline (`azure-pipelines-promote.yml`) is built for review only and never run.
6. Process, in small steps alongside 3 to 5: evidence stamping (commit, command, date, raw output on every evidence record), a pre-push hook that runs `node-gates.mjs`, and the AI-collaboration record as structured data (catches by control, interventions) with the two open theory tests (`WI-QA-002`, `G-H04` and `G-H05`).
7. Mobile: **done 2026-11-04 and 2026-11-05 (see "What is built")**; the original plan was a decision spike (`WI-QA-003`: Maestro support, Expo or another stack, local-only or CI), then one small mobile job with Maestro flows. Independent of the deploy path.
8. A recording of the demo journey, ideally against the deployed dev environment.
9. The vendor read side and queue display (`N-03`, `N-04`): **built (2026-11-01)**. Live updates by push (`WI-QUE-003`, ADR-0021) are **built and run locally (2026-11-02, branch `feature/vendor-live-queue`)**; next the vendor's actions in the queue UI.
10. Outbox and stock hardening (`N-06`, `N-07`: register items 66, 67, 74) and a latency budget (item 100).
11. A dependency audit and SBOM (`WI-SEC-004`).

Two items were deferred to a later session by the lead: `WI-REPO-003` (how deferred items, notes and delegated-work findings are tracked) and register item 94 (marking the rules in `CLAUDE.md`).

## Where the next work is

The candidate product work after slice 1, with sizes and priorities, is the "Next after slice 1" table in `docs/management/slice-1/03-prioritized-backlog.md` (N-01 to N-15). The lead decides the order. Items that already have a Ready spec are listed in `STATUS.md` (filter by status Ready). Two of the open questions that shape the order:

- Auth logic and the deployed-environment credential (`N-01`, `N-02`) need human approval.
- The vendor read side (`N-03`) is the groundwork for the queue display (`QUE-001`, `QUE-002`).

## Artifacts that are planned but not written

The deferred and proposed artifacts (RACI, hiring plan, competitive scan, monetization model, prioritization, sprint plan, postmortem) and the two started on 2026-10-30 (a runbook, done; the OKRs, in review) each have a spec; filter `STATUS.md` by Deferred, Proposed or Ready. `docs/product/scope.md` shows each artifact's state beside its role.

## How to find things

- Status of any item: `STATUS.md`. Definitions of the status words: `docs/method/status-and-supersession.md`.
- The epics and what each contains: `epic-catalog.md`.
- Unresolved findings and trade-offs: `docs/governance/open-items-register.md`.
- Decisions: `docs/architecture/adr/`.
- How to run it locally: `docs/operations/local-dev.md`.
- Earlier sequencing (queue, batches, build order): `docs/history/backlog-outline-2026-10-29.md`.
- What the documentation review found and where each finding went: `docs/product/backlog/gap-catalog/` (open) and `docs/history/review-2026-10/closing-record.md` (all).
