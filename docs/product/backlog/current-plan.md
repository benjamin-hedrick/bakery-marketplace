# Current plan

> **Status:** Current · written 2026-10-30, order of next work updated 2026-10-31. The status of every work item is in `STATUS.md` (generated); this page says what is built, what is happening now and where the next work is listed. Keep it short: update it when the focus changes.

## What is built

Slice 1 is complete and merged: a customer logs in, browses listings with stock, builds a cart, places a test order (the payment is a stub), and watches the order's status. It runs on a developer machine: the Compose infrastructure (Redis Streams, the Cosmos emulator, the mock identity issuer), the catalog and ordering services, the GraphQL BFF and the Next.js customer app. Nothing is deployed. The measured state (test counts, what was run and what was not) is in `docs/evidence/facts-sheet-2026-10-29.md` and `docs/evidence/baseline-2026-10-30.md`; the slice record is `docs/architecture/first-slice-contract.md` and `docs/evidence/slice-1/findings.md`.

Not built: the admin and notification services (scaffolds), the vendor and queue web apps, a real payment, cloud environments.

## What is happening now

The public-readiness pass is done except the settings that need the repository to be public (register item 93), and a second batch of work is on the branch `feature/ops-and-okrs`, pending review: a runbook and its test run, the first OKRs, a one-command demo with screenshots, a styling pass, a test strategy with an accessibility smoke and a traceability table, documentation checks in the pipeline, and scripted quality and latency measurements. Several of these are written but not yet seen on Azure (the `secrets` and `docs` jobs); the status of each is in `STATUS.md` and the specifics are in the commit messages and the evidence records.

**Priorities (set 2026-10-29, amended 2026-10-31):** 1. a polished, consistent repository that can be public, showing AI collaboration, architecture and software, and business and project work; 2. it builds and runs locally; 3. more evidence and coverage; 4. deploy and tear down a dev environment; 5. a public demo. On 2026-10-31 the lead made the deployed dev environment, and the ability to tear it down, the next main work, ahead of further product features.

**Waiting on the lead:** the OKR targets and the definition of the north-star safety metric (`WI-PROD-004`, In review); the first Azure run of the new pipeline jobs; the cold-machine run and a fresh reader following the demo page (`WI-DEMO-001`, In review); the flip-day settings (item 93); and, new, the approvals for the DEV identity work below (ADR-0018, `WI-AUTH-006` phase 2).

**Next, in this order (set 2026-10-31):**

1. Close out the branch: the first Azure run of the `secrets` and `docs` jobs and the cold-machine demo run.
2. `N-02`: Entra registrations and the DEV credential decision (ADR-0018 verification list, `WI-AUTH-006` phase 2). Needs the lead's approval (IAM); start first because it gates the deploy and runs alongside 3.
3. `N-10`: container images and the hosting decision (register items 25 and 71), with a compose profile that runs the whole stack. **Images and the profile are built** (`feature/dev-environment`). The web app's `/api/graphql` is now a run-time API route, so one image serves every environment (latency measured before and after: about 1 to 1.5 ms at p50 on reads; `docs/evidence/WI-DEP-001/web-runtime-config-spike-2026-10-31.md`). The login settings are also served at run time (`GET /api/config`), so the web image contains nothing environment-specific (register item 101, resolved).
4. `WI-DEP-001` part 1: **written and checked locally so far: the foundation stack, the destroy guard and a rehearsal pipeline for proving the gates; the next step is yours: run the bootstrap and the gate rehearsal on Azure** (`docs/operations/runbooks/`). Infrastructure as code in two stacks (a persistent foundation with the registry, and a disposable environment), a deploy stage and a post-deploy smoke test that reuses the Playwright smoke. The design is ADR-0020 (Proposed): build once and promote by digest; plan on pull requests only when `infra/**` changes; separate approvals for infrastructure (skipped when the plan has no changes) and application; state in a storage account.
5. `WI-DEP-001` part 2: a manual, approved teardown run with a runbook (no automatic teardown), with standup time, teardown time and cost recorded and a budget alert. Runbooks to write when each step is first run: bootstrap of the state storage and pipeline identity (with a verify section), create the dev environment, tear it down. The UAT/Prod promotion pipeline (`azure-pipelines-promote.yml`) is built for review only and never run.
6. Process, in small steps alongside 3 to 5: evidence stamping (commit, command, date, raw output on every evidence record), a pre-push hook that runs `node-gates.mjs`, and the AI-collaboration record as structured data (catches by control, interventions) with the two open theory tests (`WI-QA-002`, `G-H04` and `G-H05`).
7. Mobile: a decision spike (`WI-QA-003`: Maestro support, Expo or another stack, local-only or CI), then one small mobile job with Maestro flows. Independent of the deploy path.
8. A recording of the demo journey, ideally against the deployed dev environment.
9. The vendor read side and queue display (`N-03`, `N-04`), which give the event backbone a consumer and the deploy path something larger than slice 1.
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
