# Current plan

> **Status:** Current · written 2026-10-30. The status of every work item is in `STATUS.md` (generated); this page says what is built, what is happening now and where the next work is listed. Keep it short: update it when the focus changes.

## What is built

Slice 1 is complete and merged: a customer logs in, browses listings with stock, builds a cart, places a test order (the payment is a stub), and watches the order's status. It runs on a developer machine: the Compose infrastructure (Redis Streams, the Cosmos emulator, the mock identity issuer), the catalog and ordering services, the GraphQL BFF and the Next.js customer app. Nothing is deployed. The measured state (test counts, what was run and what was not) is in `docs/evidence/facts-sheet-2026-10-29.md` and `docs/evidence/baseline-2026-10-30.md`; the slice record is `docs/architecture/first-slice-contract.md` and `docs/evidence/slice-1/findings.md`.

Not built: the admin and notification services (scaffolds), the vendor and queue web apps, a real payment, cloud environments.

## What is happening now

The documentation reconciliation (`WI-PORT-006`) is finished and is going through a pull request. Everything it found is accounted for: what was fixed is in the documents, what is open is in the gap catalog (`gap-catalog/`), the register and the specs in `STATUS.md`, and how each finding was handled is in `docs/history/review-2026-10/closing-record.md`. No work is scheduled; the open items are Deferred or Proposed, each with a trigger, and the order is the lead's decision (see the candidate order in `docs/product/roadmap.md`).

**Priorities (set 2026-10-29):** 1. a polished, consistent repository that can be public, showing AI collaboration, architecture and software, and business and project work; 2. it builds and runs locally; 3. more evidence and coverage; 4. deploy and tear down a dev environment; 5. a public demo.

**Next session:** `WI-REPO-003` (how deferred items, notes and delegated-work findings are tracked) and register item 94 (marking the rules in `CLAUDE.md`) are the two items deferred to a later session; the first spec to pick up is the lead's choice (`WI-OPS-002` and `WI-PROD-004` are Ready).

## Where the next work is

The candidate product work after slice 1, with sizes and priorities, is the "Next after slice 1" table in `docs/management/slice-1/03-prioritized-backlog.md` (N-01 to N-15). The lead decides the order. Items that already have a Ready spec are listed in `STATUS.md` (filter by status Ready). Two of the open questions that shape the order:

- Auth logic and the deployed-environment credential (`N-01`, `N-02`) need human approval.
- The vendor read side (`N-03`) is the groundwork for the queue display (`QUE-001`, `QUE-002`).

## Artifacts that are planned but not written

The deferred and proposed artifacts (RACI, hiring plan, competitive scan, monetization model, prioritization, sprint plan, postmortem) and the two ready to start (a runbook, the OKRs) each have a spec; filter `STATUS.md` by Deferred, Proposed or Ready. `docs/product/scope.md` shows each artifact's state beside its role.

## How to find things

- Status of any item: `STATUS.md`. Definitions of the status words: `docs/method/status-and-supersession.md`.
- The epics and what each contains: `epic-catalog.md`.
- Unresolved findings and trade-offs: `docs/governance/open-items-register.md`.
- Decisions: `docs/architecture/adr/`.
- How to run it locally: `docs/operations/local-dev.md`.
- Earlier sequencing (queue, batches, build order): `docs/history/backlog-outline-2026-10-29.md`.
- What the documentation review found and where each finding went: `docs/product/backlog/gap-catalog/` (open) and `docs/history/review-2026-10/closing-record.md` (all).
