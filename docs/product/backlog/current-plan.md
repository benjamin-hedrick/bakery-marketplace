# Current plan

> **Status:** Current · written 2026-10-30, order of next work updated 2026-11-03. The status of every work item is in `STATUS.md` (generated); this page says what is built, what is happening now and where the next work is listed. Keep it short: update it when the focus changes.

## What is built

Slice 1 is complete and merged: a customer logs in, browses listings with stock, builds a cart, places a test order (the payment is a stub), and watches the order's status. It runs on a developer machine: the Compose infrastructure (Redis Streams, the Cosmos emulator, the mock identity issuer), the catalog and ordering services, the GraphQL BFF and the Next.js customer app. Nothing is deployed. The measured state (test counts, what was run and what was not) is in `docs/evidence/facts-sheet-2026-10-29.md` and `docs/evidence/baseline-2026-10-30.md`; the slice record is `docs/architecture/first-slice-contract.md` and `docs/evidence/slice-1/findings.md`.

Since slice 1 (merged 2026-11-01, local only): the vendor's order read side in the ordering service and BFF (`WI-QUE-001`) and the queue display app, which polls every 7 seconds (`WI-QUE-002`, both Done); and browser sessions (`WI-AUTH-007`, ADR-0019): a server-side session behind an HttpOnly cookie in `packages/web-session`, used by both web apps, with the mock issuer's refresh grant. The real-stack evidence is in `docs/evidence/WI-AUTH-007/findings.md`. `WI-AUTH-007` stays In progress until the lead reviews its security-sensitive phases (the AI pass on 2026-11-02 was a code read; register items 118 to 122 are open from it).

Built since, on `feature/vendor-live-queue` (not yet pushed or merged): live updates to the vendor's queue by push (`WI-QUE-003`, ADR-0021): the queue display says Live while a stream is up and polls as the fallback; on the real local stack a customer's order reaches the vendor's screen about 100 ms after it is placed (`docs/evidence/WI-QUE-003/real-stack-2026-11-02.md`). The item is Done (2026-11-02), approved by the lead after a review round; its known limits are in the item (not seen on Azure or behind API Management, no load, fuzz or penetration testing, register item 127 open).

Built since, on `feature/quality-vendor-actions` (not yet merged; a quality-and-vendor pass, 2026-11-02 and 2026-11-03, all local): the vendor's actions in the queue display (accept, decline, start, ready, hand over; `WI-QUE-004`); first rate limits at the web apps and a backstop at the BFF (`WI-RATE-001`, register item 128); Firefox, WebKit and phone-profile projects for the browser suites (`BROWSERS=all`; register item 132 lists 13 failures not yet diagnosed); a threat model, generated-input tests, a 66-minute soak, an OWASP ZAP scan and a statement of what has been reviewed (`WI-SEC-005`, register item 129), which led to browser hardening headers (CSP, frame protection), limits on GraphQL operation size, and the fix of a request that ended the BFF process (register items 134 to 136). The verification policy and the other process-review edits (register item 130) are merged as proposals. The lead has not yet reviewed any of this branch.

Not built: the admin service (a scaffold), the admin web app, the vendor's order actions in the queue UI, a real payment, cloud environments.

## What is happening now

The public-readiness pass is done except the settings that need the repository to be public (register item 93), and the second batch of work (a runbook and its test run, the first OKRs, a one-command demo with screenshots, a styling pass, a test strategy with an accessibility smoke and a traceability table, documentation checks in the pipeline, and scripted quality and latency measurements) is merged. Those pipeline jobs, the `secrets` and `docs` jobs included, were seen green on Azure on 2026-10-31 (`docs/process/quality-gates.md`); the status of each is in `STATUS.md` and the specifics are in the commit messages and the evidence records.

**Priorities (set 2026-10-29, amended 2026-10-31):** 1. a polished, consistent repository that can be public, showing AI collaboration, architecture and software, and business and project work; 2. it builds and runs locally; 3. more evidence and coverage; 4. deploy and tear down a dev environment; 5. a public demo. On 2026-10-31 the lead made the deployed dev environment, and the ability to tear it down, the next main work, ahead of further product features.

**Waiting on the lead:** the four decisions in register item 131 (whether `WI-QUE-003` stays Done before an Azure pipeline run; items 127 and the unchecked API Management streaming; the delay display's shared-clock condition), the review of `WI-AUTH-007`; the OKR targets and the definition of the north-star safety metric (`WI-PROD-004`, In review); the first Azure run of the new pipeline jobs; the cold-machine run and a fresh reader following the demo page (`WI-DEMO-001`, In review); the flip-day settings (item 93); and, new, the approvals for the DEV identity work below (ADR-0018, `WI-AUTH-006` phase 2).

**Next, added 2026-11-02 (after the review of `WI-QUE-003`), ahead of the list below:**

- **Review of the quality-and-vendor branch** (`feature/quality-vendor-actions`, about 18 commits): `WI-QUE-004`, `WI-RATE-001`, `WI-SEC-005` and the cross-browser projects. Open for the lead: register item 137 (the BFF backstop is shared by all users of a web app), whether a deployed environment refuses GraphQL introspection, `'unsafe-inline'` in the CSP's `script-src`, the production numbers for the rate limits, and item 132 (13 cross-browser failures to diagnose).
- **Adopt or change the process-review proposals** (`docs/process/verification-policy.md`, the Definitions of Ready and Done, NFR 3.8, 3.9, 5.1 and 5.2): merged as proposals; nothing is binding until the lead says so.
- **Review of `WI-AUTH-007`** by the lead (it stays In progress until then), with register items 118 to 122 and the pipeline's first Azure run of the `queue` and `session` jobs.
- **Item 127** (order changes cross Redis Pub/Sub in the clear) is decided with the deployed Redis (`WI-DEP-001`).

**Notifications built (2026-11-03, branch `feature/slice-notifications`, not yet pushed or reviewed):** `NOT-001` and `NOT-002` are In review, with `ICacheProvider.GetManyAsync` and `IEventSubscriber.SubscribeBatchAsync` added to `tools/`. Local only: no real provider. Also on the branch: the service in the Compose `apps` profile, run against a real-checkout smoke (66 notifications, no errors), a contract test of the event names against ordering, and one trace span per batch. Allergy and low-stock templates wait for their events (register 138).

**Product order agreed with the lead (2026-11-02):** after the quality work, notifications on order events (`NOT-001`, `NOT-002`; built, above), then the customer's order history (`WI-CUST-007`) and personalization, then a mobile spike (`WI-QA-003`). Vendor onboarding (seeded data and the mock identity stay), the admin console and a real payment (design only) come last or are not built for the demo. The deployed dev environment, Azure and Entra stay a separate, parallel track.

**Next, in this order (set 2026-10-31):**

1. Close out the branch: the first Azure run of the `secrets` and `docs` jobs and the cold-machine demo run.
2. `N-02`: Entra registrations and the DEV credential decision (ADR-0018 verification list, `WI-AUTH-006` phase 2). Needs the lead's approval (IAM); start first because it gates the deploy and runs alongside 3.
3. `N-10`: container images and the hosting decision (register items 25 and 71), with a compose profile that runs the whole stack. **Images and the profile are built** (`feature/dev-environment`). The web app's `/api/graphql` is now a run-time API route, so one image serves every environment (latency measured before and after: about 1 to 1.5 ms at p50 on reads; `docs/evidence/WI-DEP-001/web-runtime-config-spike-2026-10-31.md`). The login settings are also served at run time (`GET /api/config`), so the web image contains nothing environment-specific (register item 101, resolved).
4. `WI-DEP-001` part 1: **written and checked locally so far: the foundation stack, the dev environment stack with the mock issuer as the first deployed issuer (2026-10-31; items 102, 108 and 110 are decided, and nothing has been planned or applied on Azure), the destroy guard and a rehearsal pipeline for proving the gates; the gate rehearsal passed on Azure (G1 to G8, 2026-10-31 to 2026-11-01, `docs/evidence/WI-DEP-001/gate-rehearsal-2026-11-01.md`); the next step is yours: run the bootstrap on Azure, with costs from there on** (`docs/operations/runbooks/`). Infrastructure as code in two stacks (a persistent foundation with the registry, and a disposable environment), a deploy stage and a post-deploy smoke test that reuses the Playwright smoke. The design is ADR-0020 (Proposed): build once and promote by digest; plan on pull requests only when `infra/**` changes; separate approvals for infrastructure (skipped when the plan has no changes) and application; state in a storage account.
5. `WI-DEP-001` part 2: a manual, approved teardown run with a runbook (no automatic teardown), with standup time, teardown time and cost recorded and a budget alert. Runbooks to write when each step is first run: bootstrap of the state storage and pipeline identity (with a verify section), create the dev environment, tear it down. The UAT/Prod promotion pipeline (`azure-pipelines-promote.yml`) is built for review only and never run.
6. Process, in small steps alongside 3 to 5: evidence stamping (commit, command, date, raw output on every evidence record), a pre-push hook that runs `node-gates.mjs`, and the AI-collaboration record as structured data (catches by control, interventions) with the two open theory tests (`WI-QA-002`, `G-H04` and `G-H05`).
7. Mobile: a decision spike (`WI-QA-003`: Maestro support, Expo or another stack, local-only or CI), then one small mobile job with Maestro flows. Independent of the deploy path.
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
