# Edit plan (draft for approval, 2026-10-29)

> **Status:** Historical · moved 2026-10-30 from `docs/governance/`. A working record of the October 2026 documentation review. Its findings are dispositioned in [`closing-record.md`](closing-record.md) and the live gap catalog (`docs/product/backlog/gap-catalog/`). The text is unchanged except that the names of three other repositories are replaced by labels (peer-A: a process framework; peer-B: an AI collaboration playbook; peer-C: an older playbook) and that references to files that moved were re-pointed. Relative links in it no longer work.

One ordered pass that carries out the reorganization (`51`) and the document fixes found in `10` to `40`, grouped by theme so no file is edited twice. It begins with the definitions the lead asked for, because several of the fixes depend on vocabulary that does not exist yet in bakery. Nothing here has been applied.

## A. What is defined today, and what is missing

| Question | Today in bakery | Verdict |
|---|---|---|
| ADR statuses | `adr/template.md`: Proposed, Accepted, Superseded; amendments as dated notes at the bottom | **Defined**, but practice added non-standard text to the status line ("validation pending ...", "phase 1 built ..."). Needs one rule (below) |
| Work-item and epic statuses | None defined. The peer template says Not Started, Ready, In Progress, Review, Done; bakery uses Ready, Done, Built, Proposed, Blocked, In Progress, "Review - content complete", plus SUPERSEDED, ADJUSTED, OBSOLETE, HOLD and Deferred in the outline | **Not defined** |
| Document status | None. A few files say "Superseded", "Official reconciliation record", "Snapshot, not automated" | **Not defined** |
| Register item status | The "running list rule" says mark `Resolved <date>`; no field, no other states | **Partly defined** |
| Reconciliation note, outcome note, amendment note, supersession note | Conventions exist and are used consistently in practice: a dated note at the top of a spec (`CLAUDE.md`, `WI-PORT-006`), outcome notes on built items, amendment notes at the bottom of ADRs | **Defined by use**, written down only in the dispositions records and `architecture-review.md` |
| Process glossary | `ddd/glossary.md` is the domain language only | **Missing** (terms such as outcome note, banner, slice, packet, gate are undefined) |
| Work-item template | Lives only in the peer repo; 67 specs follow it | **Missing in bakery** (copy-in CI-01) |

So the answer to "do we have a template, statuses, a glossary" is: the ADR template and the note conventions exist; the status vocabularies, the process glossary and the work-item template do not, and should be created first (Step 0), so the later steps follow one pattern.

## B. Proposed definitions (Step 0 content, for approval)

### B1. Work item and epic status (one word, first line of the file)

| Status | Meaning | Required beside it |
|---|---|---|
| Proposed | Suggested, not accepted | who decides |
| Ready | Accepted and specified (meets the Definition of Ready), not started | |
| In progress | Being built; may be partly built | what remains |
| In review | Content complete, waiting for a named decision or approval | the decision |
| Blocked | Cannot proceed | the named blocker |
| Built | Implemented; the verification its acceptance requires is not yet complete | what verification is missing |
| Done | Acceptance criteria met and verified as the item requires (tests, a clean-agent or CI run where it applies), documents updated | evidence pointer |
| Deferred | Decided not now | the trigger to revisit |
| Superseded | Replaced | by which item |
| Obsolete | Cancelled, no longer needed | why |

"Adjusted" is **not a status**: it is a kind of note (requirements kept, implementation changed). Epic status is derived from its items and stated as counts (for example "6 of 8 done"), never typed by hand.

### B2. Document status (banner, first line under the title)

`> **Status:** Current · verified 2026-10-29` · `Snapshot` (dated, point in time, not maintained; say what supersedes it if anything) · `Superseded by <link>` · `Historical` (kept as a record; in `docs/history/`). Evidence files are snapshots and begin with a **Current result** line, so a reader does not have to read to the end.

### B3. ADR status (status line only)

`Proposed` · `Accepted` · `Accepted, amended <date(s)>` · `Superseded by ADR-N`. The status line **never carries pending validation or build progress**: validation outcomes get their own dated "Validation outcome" section (ADR-0012 already does this), and build progress belongs to the work items. The decision text is never edited; only the status line and appended dated notes change.

### B4. Register item status (a `Status:` line under each item's Type line)

`Open` · `Tracking` (known limitation being watched) · `Accepted` (risk or limitation accepted, with owner) · `Deferred` (with trigger) · `Resolved <date>` (with a pointer). The existing numbering and text are kept.

### B5. Note types (the only edits allowed to historical specs)

| Note | Where | Purpose | Exists today |
|---|---|---|---|
| Status banner | line 1 of every `WI-*.md` and `EPIC-*.md` | the true status per B1, one line, and a pointer when the body is out of date: `> **Status (2026-10-29):** Done · built differently from this spec, see the Outcome note · evidence: ...` | New, one line |
| Outcome note | above the spec | what was built, how it differs, how it was verified, what was not done | Yes, 14 files |
| Reconciliation note | above the spec | ADJUSTED, SUPERSEDED or OBSOLETE with date and reason | Yes |
| Amendment note | bottom of an ADR | a dated change that does not alter the decision text | Yes |
| Supersession note | bottom of the superseded ADR/doc + a status change | | Yes (ADR-0011) |

### B6. Process glossary (`docs/method/glossary.md`)

Terms to define in one sentence each: work item, epic, slice, status banner, outcome note, reconciliation note and record, amendment note, evidence record, register, gate, snapshot, historical, packet and wave (September vocabulary), hat/role, human approval, mutation check, clean-agent verification, real-stack journey.

## C. Further edits needed beyond status

| Edit | Where | Count |
|---|---|---|
| Status banner (B5) | `WI-*` (67), `EPIC-*` (3) | 70 |
| ~~"Built differently" banner~~ **Withdrawn 2026-10-29 (lead):** it adds confusion. Replaced by decision R-03 in `60-resume-here.md`: rewrite unbuilt specs to current; for built specs describe what exists plus a short "Changes from the original plan" section (original stays in git), or split original to history | `ORD-001`, `ORD-002`, `CUST-003`, `CUST-004`, `TOOL-002`, `QUE-001`, `EVT-001` | 7 |
| ADR status line + appended dated note | ADR-0001, 0002, 0003, 0004, 0006, 0010, 0012, 0013, 0015, 0016, 0017 | 11 |
| One-line reference removal inside ADR/spec text | ADR-0009; `WI-CACHE-001`, `WI-EVT-001`, `WI-GOV-001` | 4 |
| Outline: statuses regenerated from `STATUS.md`; epic roll-ups replaced by counts; `AUTH-006` moved to `EPIC-AUTH`; On Deck replaced | one file | 1 |
| Register: Status field, item B2 added, stale entries reconciled (2, 10, 11, 19, 20, 21/22, 23, 31, 33, 48, 49, 54) | one file | 1 |
| Rewrite in bakery's voice (no peer references) | `architecture-review.md`, `definition-of-ready.md`, `engineering-standards.md`, `risk-register.md` | 4 |
| Replace stale text | `c4/context.md`, `c4/container.md`, `ddd/README.md`, `ddd/event-storming.md`, `nfrs.md`, `tech-stack.md`, `order-lifecycle.md` (headings), `first-slice-contract.md` (status summary), `sla.md`, `local-dev.md`, `budget-cost-estimate.md`, `management/README.md`, `portfolio-slice/*` statuses, `quality-gates.md` (counts), `branching-strategy.md` (promotion path as target), three evidence headers | ~20 |
| `CLAUDE.md` (approved) | see D | 1 |

## D. `CLAUDE.md` corrections (approved by the lead; applied in Step 1)

| Current text | Change |
|---|---|
| "ordering-service has the `Order` aggregate ... `POST /ordering/checkout` ... (payment is a stub and no events are published yet)" | State what is built: aggregate and persistence, checkout with idempotency, pickup windows, the outbox and relay, vendor and customer actions, automatic confirmation; payment is a stub; events publish through the outbox |
| "The only frontend code is the `WI-PORT-001` proof ..." | The customer app implements slice 1 (login, browse with stock, cart, checkout, order status); `web-admin` and `web-queue-display` are empty |
| Root solution "the 4 service projects, the 7 `tools/` libraries, and the catalog-service test project" | 4 services, 9 tools projects, and the catalog and ordering test projects |
| `dotnet test services/catalog-service/tests/CatalogService.Tests   # 28 tests` | 104; add the ordering command (340, 3 skipped) |
| "ADRs 0001 to 0016" | 0001 to 0018 (0018 Proposed) |
| "Target shape ... not yet built" paragraph | Rewrite as built shape, noting what is local-only and not deployed |
| "The existing `CorrelationIdMiddleware` still trusts an inbound header; changing that is `WI-PORT-005`" | Remove: it never adopts the inbound header (ADR-0016, done) |
| "Start from `docs/project-log.md` and the On Deck section of `MASTER-BACKLOG-OUTLINE.md`" | Point to `docs/product/backlog/STATUS.md` and `current-plan.md` (after Step 3) |
| Add | The status vocabulary pointer (`docs/method/status-and-supersession.md`); "tests run: BFF 75, web unit 53, tools 214" refreshed from the facts sheet; the register Status field; the history folder |

## E. Proposed statuses for the 67 specs (for the lead to confirm before banners are applied)

Evidence for each is the Outcome note in the file or the cited record. Statuses follow B1.

- **Done (46, including CUST-004 after its split on 2026-10-30; 48 with the two provisional):** ARCH-001, ARCH-002, ARCH-003, ARCH-004, AUTH-001, AUTH-002, AUTH-005, CACHE-001, CACHE-002, CACHE-003, CACHE-004, CAT-001, CAT-005, CAT-006, CUST-002, CUST-003, CUST-004, DATA-001, DATA-002, DEV-001, DEV-002, DEV-004, EVT-001, EVT-003, GOV-001, MGMT-004, MGMT-007, MGMT-008, NFR-001, OPS-001, OPS-003, ORD-001, ORD-002, ORD-004, ORD-005, ORD-006, ORD-007, ORD-008, PORT-001, PORT-002, PORT-003, PORT-007, PROD-001, SEC-003, TOOL-001, TOOL-002.
- **Done, provisional (2):** MGMT-001 (its open point, relative sequencing, was settled in the plan text), PORT-005 (acceptance met; register items 36, 37, 42 remain open as follow-ups).
- **In progress (3):** AUTH-006 (phase 1 built, phase 2 needs the DEV tenant), ORD-003 (windows done; `PickupFulfillment` events remain), PORT-006 (pass 2 is this review).
- **In review (2):** MGMT-002 (ratings to confirm), MGMT-005 (labor cost left open by design).
- **Built (1):** SEC-001 (the Terraform module exists; `terraform plan` was never run).
- **Ready (12):** CAT-003, CUST-005, CUST-006, CUST-007 (new, the order history list split out of CUST-004), PORT-004, PREF-001, PREF-002, QUE-001, QUE-002, SRCH-001, VEN-001, VEN-002.
- **Superseded (1):** WEB-001 (by PORT-001 and PORT-002).
- **Duplicate (deleted 2026-10-30):** DEV-003.

45 + 2 + 4 + 2 + 1 + 11 + 1 + 1 = 67 as first drafted. After the lead's calls of 2026-10-30 (DEV-003 deleted; CUST-004 split so it is Done; CUST-007 added): 46 + 2 + 3 + 2 + 1 + 12 + 1 = 67 specs, with CUST-004 counted in the 46. The generated table in Step 3 must reproduce these counts; if it does not, the banners are wrong.

**Items needing the lead's call:** `PORT-005` (Done, with open register items 36, 37, 42, or In progress); `MGMT-001` (its open decision, relative sequencing, was resolved in the plan text: Done?); `CUST-004` (In progress, or split off "order history" as its own item and mark this one Done); `ORD-003` (same split question); `SEC-001` (Built, or Done if the Terraform module's validation is judged out of scope); `PORT-006` (stays In progress until this review is closed); `DEV-003` (delete).

Epic roll-ups, derived: `EPIC-CACHING` 4 of 5 (CACHE-005 held); `EPIC-PORTFOLIO-SLICE` 5 of 7 (PORT-004 Ready, PORT-006 in progress); `EPIC-WEB-CUSTOMER` 3 of 6 (CUST-002, CUST-003 and CUST-004 done; CUST-005, CUST-006 and CUST-007 Ready; WEB-001 superseded and not counted).

## F. Ordered steps

| Step | What | Files | Check | Commit grouping |
|---|---|---|---|---|
| 0 | Create `docs/method/` with `README`, `status-and-supersession.md` (B1 to B5), `glossary.md` (B6), `work-item-template.md` (adapted from CI-01 with B1 statuses) | 4 new | Lead approves B1 to B6 before Step 2 | PR A |
| 1 | Safe removals and `CLAUDE.md`: delete `adr/0000-template.md` (fix its 1 reference), `.claude/CLAUDE.md`, the two empty `tools/` folders; correct `CLAUDE.md` (D) | ~6 | `dotnet build`, `git grep` for removed paths | PR A |
| 2 | **Waits on R-03.** Status banners on 67 specs and 3 epics using the confirmed statuses (E); the seven contradicting specs are rewritten or split per R-03, not bannered | 70 | Script verifies every spec has a banner and the first line is unchanged below it | PR A |
| 3 | Generate `STATUS.md` (script `scripts/docs/status.mjs`: specs, epics, ADRs, register) and rewrite the outline into `current-plan.md` and `epic-catalog.md` | 4 | Generated counts equal the manual ones; the script fails if a spec lacks a banner | PR A |
| 4 | ADR status lines + appended notes (11) and the ADR README rewrite with a status column | 12 | `git diff` shows no changes to Decision text | PR A |
| 5 | Register: Status field on all 82 items; add the B2 item; reconcile stale entries | 1 | Count of Open/Tracking/Resolved printed and checked against the old hand count | PR A |
| 6 | Remove peer references (19 files) and rewrite the four documents (C) | 19 | `git grep peer-A` and `peer-B` return nothing outside `history/` | PR A |
| 7 | Architecture: `container.md`, `context.md`, request path diagram, patterns page, decision timeline, `tech-stack.md`, `nfrs.md`, `ddd/*`, `data-model` split (as-built reference stub + target), component diagram | ~12 | Diagrams render (Mermaid); every claim in a changed row checked against the facts sheet | PR B |
| 8 | Operations, process, management: `local-dev.md` (run slice 1), `sla.md`, `risk-register.md`, `budget-cost-estimate.md`, DoD, DoR, standards, branching, `portfolio-slice/*` statuses, evidence headers | ~15 | `T-03` demo script runs from the documented commands; commands in docs copied from the facts sheet | PR B |
| 9 | Front door: `README.md`, `docs/index.md`, `mkdocs.yml`, `portfolio-plan.md` status column, `demo-milestones.md` (merge) | 5 | README claims each have a link to evidence; link check | PR C |
| 10 | Archive moves and `docs/history/` with its README (51), re-point inbound links | ~30 moved | Link check before and after | PR C |
| 11 | Populate `docs/method/` from the copy-in register (CI-02 to CI-08, CI-30 to CI-37) as the first new artifacts (target map T-13 to T-17) | new | Each file says what bakery does; no peer references | PR C and after |
| 12 | New artifacts from the target map, in the order suggested there; each is its own work item with its own status | many | Per item | separate PRs |

All commits cite `WI-PORT-006` (pass 2), whose scope this is; Step 12 items get their own work items. Branches are themed per the conventions (`feature/docs-foundations`, `feature/docs-architecture-ops`, `feature/docs-front-door-history`), rebased on `origin/main` before each push; the lead opens the PRs. Shared files (outline, register, `mkdocs.yml`, `CLAUDE.md`) are edited by one branch at a time: PR A owns them first, PRs B and C wait for A.

## G. Verification used at every step

- The link check (`T-09`): every relative Markdown link and every backtick path that names a repo file must resolve; reported before and after.
- A stale-phrase list searched across `docs/`: "Azure AD B2C" outside ADR-0006's amendments and history; "Static Web Apps" outside ADR-0011/0012; "validation pending"; "Scaffold only" on `ordering-service`; "peer-A"; "peer-B"; `docker-compose up` outside the infrastructure sentence.
- Counts quoted in prose are copied from the facts sheet, not typed from memory.
- Nothing is called working that was not run (`CLAUDE.md` rule): new commands are run before they are documented.

## H. Decisions needed before Step 0 and Step 2

1. **B1 to B6** (the vocabulary and note formats): approve or amend.
2. **E**: confirm the proposed statuses, especially the seven items listed under "needing your call".
3. **`WI-DEV-003`**: delete (recommended) or replace with a Stripe CLI stub.
4. **`project-log.md`**: fold into `index.md` and `STATUS.md`, then archive (recommended), or keep as a hand-maintained index.
5. **`portfolio-plan.md`** at the repository root: keep there, or move into `docs/` so the docs site can link to it.
6. **LICENSE choice** (T-04), needed before the repository is made public.


## I. Changes after the lead's review of the drafts (2026-10-29)

- The "built differently" banner is withdrawn (section C, Step 2); see `60-resume-here.md` R-03.
- Added review tasks: ADR consolidation and reorganization (R-07, before Step 4); portfolio-plan and other consolidation candidates (R-06, `60` §7); creation of work items and plans in this pass (`60` §6); diagram, API, checklist, template, standard, evidence and theory details (`61`); backfill of templates, standards, checklists and evidence (`61` §3 to §6, `60` §5).
- The full to-do list, open decisions and the criteria for a clean repository are in `60-resume-here.md`.
