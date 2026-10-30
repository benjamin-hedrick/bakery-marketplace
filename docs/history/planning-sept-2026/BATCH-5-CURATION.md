# Batch 5 — Curated List (Preferences & Vendor Onboarding)

> **Status:** Historical · moved 2026-10-30 from `docs/product/backlog/`. A September 2026 planning record; the items it covers carry their own status banners now (`docs/product/backlog/STATUS.md`). The text is unchanged; relative links in it no longer work.

> Folds into `MASTER-BACKLOG-OUTLINE.md`'s "Agent-Ready Queue" section, as a
> fifth batch beneath Batches 1–4. Reconciles a domain-logic curation pass
> drafted independently in a parallel planning session on 2026-09-13, which
> named itself "Batch 3" before that name was already taken in this repo by
> the foundational-interfaces batch landed 2026-09-12. See the renaming note
> below for what changed and why.

## Renaming / overlap note (2026-09-13 reconciliation)

The original curation this file is based on selected nine items — `CAT-001`,
`PREF-001`, `PREF-002`, `ORD-002`, `ORD-004`, `ORD-006`, `QUE-001`, `VEN-001`,
`VEN-002` — under the name "Batch 3," using the same selection criteria as
below. By the time this was reconciled against the live repo, `CAT-001`,
`ORD-002`, `ORD-004`, `ORD-006`, and `QUE-001` had already been curated,
detailed, and marked Ready as part of this repo's own **Batch 4** (the
walking-skeleton batch, 2026-09-12) — independently, but for the same reason
(they're the walking-skeleton path from `portfolio-plan.md` section 2). Rather
than duplicate those five items under a second name, this file keeps only the
four items Batch 4 does **not** already cover: `PREF-001`, `PREF-002`,
`VEN-001`, `VEN-002`. Everything else in the original curation's reasoning
(preconditions, selection criteria) still applies and is preserved below.

## Precondition — check before assigning any item below

1. Each Batch 1 item's delivered code has been checked against its `WI-*.md` spec's documented interface signature (`ICacheProvider`, `IEventPublisher`/`IEventSubscriber`, `IRepository<T>`, JWT middleware), using each item's own contract-test suite as the concrete check. **Status: done** — see `docs/ACTIVITY-LOG.md`'s 2026-09-12 entry.
2. `WI-DEV-001` (base .NET solution scaffold) exists and is committed — every item in this batch assumes real `.csproj`/project references, the same assumption Batch 1/2 silently made per `worklog-2026-09-07.md` gap #1. **Status: drafted 2026-09-13** (see `WI-DEV-001.md`); confirm it's actually merged before assigning.

If precondition 2 isn't yet true, this list is ready to *review*, not yet ready to *assign*.

## Selection criteria used (unchanged from the original curation)

- Fully-specified backend contract already in `data-model-api-contracts.md` — no invented shapes
- Named, real bounded contexts from `portfolio-plan.md`'s MVP scope that otherwise have zero detailed work items (Preferences & Dietary Safety, Vendor Onboarding & Verification — both still `Not Started` in `MASTER-BACKLOG-OUTLINE.md` as of this reconciliation)
- Dependencies between them made explicit, not discovered later (same discipline as every other batch)

## Curated Batch 5 list

| Item | Type | Depends on | What it produces |
|---|---|---|---|
| `PREF-001` | Service Implementation | `DATA-001` (`IRepository<T>`) | Preference Profile CRUD |
| `PREF-002` | Integration | `EVT-001` (envelope shape only — matches Batch 2's `TOOL-001` reasoning) | Publish Preference Snapshot via Open Host Service to Search + Ordering |
| `VEN-001` | Service Implementation | `DATA-001` | Vendor profile + `VendorType` (Shop \| Independent) |
| `VEN-002` | Service Implementation | `DATA-001`, `EVT-001` | Verification status workflow (`Pending → Verified` / `Suspended`) — the real implementation that eventually replaces `DEV-004`'s seed-script workaround (see `WI-CAT-001.md`'s Open Points) |

**Update 2026-09-13**: all four items have since been fully detailed — see `WI-PREF-001.md`, `WI-PREF-002.md`, `WI-VEN-001.md`, `WI-VEN-002.md`. Two small gaps surfaced while drafting them, resolved in the same pass rather than left open: `PREF-002` needed a real event name for the Preference Snapshot publication (named `PreferenceSnapshotPublished`, added to `glossary.md` and `data-model-api-contracts.md`); `VEN-001` needed a vendor self-application endpoint that had never been added to `data-model-api-contracts.md` despite being named in `event-storming.md`'s Flow 1 (`ApplyAsVendor`) — added as `POST /admin/vendors` plus `GET`/`PUT` for a vendor's own profile.

**Already covered by Batch 4, not repeated here**: `CAT-001`, `ORD-002`, `ORD-004`, `ORD-006`, `QUE-001` — see `MASTER-BACKLOG-OUTLINE.md`'s Batch 4 table for their full detail.

**Deliberately excluded from this batch, with reasons (carried over from the original curation)**:
- `CAT-002`/`CAT-003`/`CAT-004`, `SRCH-*`, `ADV-*`, `PAY-*`, `REV-001`, `ADM-*` — real, but each either depends on an item in this batch not yet built (e.g., `SRCH-001` needs `PREF-002`'s snapshot to exist as a real feed) or belongs to a feature slice after the walking skeleton per `project-plan.md` Phase 3, not Phase 2.
- `VEN-003` (Stripe Connect onboarding) — depends on `PAY-*` groundwork not yet batched; held for a payments-focused batch instead.

## Internal dependency note

`PREF-002` depends on `PREF-001` existing first (a snapshot can't be published from a profile that doesn't exist yet); `VEN-002` similarly depends on `VEN-001`. Neither pair has a cross-pair dependency — `PREF-*` and `VEN-*` can be worked as two fully independent tracks.

## Recommended sequencing once preconditions clear

1. `PREF-001`, `VEN-001` — no intra-batch dependencies, safe to send to separate agents in parallel
2. `PREF-002`, `VEN-002` — depend on the above existing first
