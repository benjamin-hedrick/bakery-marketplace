# Review record: `docs/product` (2026-10-29)

> **Status:** Historical · moved 2026-10-30 from `docs/governance/`. A working record of the October 2026 documentation review. Its findings are dispositioned in [`closing-record.md`](closing-record.md) and the live gap catalog (`docs/product/backlog/gap-catalog/`). The text is unchanged except that the names of three other repositories are replaced by labels (peer-A: a process framework; peer-B: an AI collaboration playbook; peer-C: an older playbook) and that references to files that moved were re-pointed. Relative links in it no longer work.

Part A (below): `vision`, `personas`, `roadmap`, `okrs`, and the backlog's non-work-item files: `README`, `MASTER-BACKLOG-OUTLINE`, `EPIC-*` (3 files), `LOCAL-MILESTONES`, `PARKING-LOT`. Part B: the 67 `WI-*.md` specs. Part C: batch curation, reconciliation records, delegation packets, worklogs. Checked against `docs/evidence/facts-sheet-2026-10-29.md`. Disposition codes: KEEP, UPDATE, REWRITE, MERGE, ARCHIVE, DELETE, CREATE.

## Part A

| File | Purpose / audience | Status and authority | Conflicts and gaps | Disposition |
|---|---|---|---|---|
| `vision.md` (34) | Problem, audience, value, success measures, principles, out of scope | Authoritative; no status line | Sound and consistent with what was built (dietary safety, zero trust, extensibility, small vendors, small real thing). Gaps: the four success measures (time-to-first-order, zero allergy incidents, order cycle time, vendor retention) have no instrument and no owner; principle 1 (dietary safety at browse, customize and cart) is only partly built (allergen flags shown on listings; preferences and personalization, `PREF`/`SRCH`/`CUST-005/006`, not built). Principle 5 text narrates history ("never written down until ADR-0008") which a public reader does not need | UPDATE (status of each principle in the product; trim narrative) |
| `personas.md` (31) | Four personas tied to product decisions | Authoritative | Good, each persona names the decision it drives. Gap: no persona has a journey that the demo shows; Marcus (queue display) and Sam (admin) are unserved by anything built; Dana is partly served | KEEP; add "served today" line per persona |
| `roadmap.md` (3) | Roadmap | Stub, 3 lines | Points to `portfolio-plan.md`; README sends visitors here as step 5 of "the story" | REWRITE (phases from `project-plan.md`, slice 1 done, next work from `slice-1/03` after the reprioritisation) |
| `okrs.md` (3) | Success metrics | "TODO" | Vision names measures; backlog `PROD-004` ⚪ | REWRITE or ARCHIVE until real |
| `backlog/README.md` (13) | Backlog guide | Stale | "pre-Issue", "two items fully detailed" (67 specs exist), points to the external template repo (breaks no-reference rule) | REWRITE |
| `backlog/MASTER-BACKLOG-OUTLINE.md` (429) | Epic catalog, queue, On Deck, gaps | "Authoritative for status" per `CLAUDE.md` | See findings below | REWRITE as two documents (current plan; epic catalog) |
| `backlog/EPIC-PORTFOLIO-SLICE.md` (24) | Epic record | Status "Started (...1 in progress)"; slice is complete | `PORT-006` shown In Progress; `PORT-002/003/005` shown Ready or blocked though built | UPDATE |
| `backlog/EPIC-WEB-CUSTOMER.md` (18) | Epic record | Status "none built yet" | **False**: `CUST-002` (browse and detail with stock), `CUST-003`, `CUST-004` are built; `CUST-005/006` are not. Its reconciliation note is accurate | UPDATE |
| `backlog/EPIC-CACHING.md` (20) | Epic record | "4 of 5 detailed; 4 done" | Consistent; `CACHE-005` held for open item 22. No `WI-CACHE-005` file exists (counted as "detailed" in the header: it is title-only) | KEEP |
| `backlog/LOCAL-MILESTONES.md` (47) | What a local run lets a person do, by milestone | All five milestones say "Scoped" | M1 and M3 are largely met by slice 1 but not as written: M1 says `docker-compose up` brings up "all four services" (compose runs infrastructure only); M3's "done" includes order history and a live queue display (neither exists). M2 partly met (no preferences, no vendor onboarding). This is the best existing answer to "what can I run" | REWRITE as a demo-milestone status table with a "how to run" column (ledger P-8) |
| `backlog/PARKING-LOT.md` (11) | Transient items | Stale | Refers to a missing `worklog-2026-09-07.md`; cites the external template repo; items duplicate the register (24) or belong in it (APIM versioning, shared package extraction) | ARCHIVE (move the 3 live items to the register) |

### Findings from the outline (`MASTER-BACKLOG-OUTLINE.md`, read in full, 429 lines)

1. **Mixed purposes in one file.** A queue of "agent-ready" batches (September), an On Deck list (last decided 2026-10-26), an epic catalog (the valuable part), a build order, and nine historical "gaps". The header says "titles only"; the file is 429 lines of narrative.
2. **On Deck is stale and misleading**: items 1 to 3 (`DEV-001`, Batch 3, `WEB-001`) are done or superseded; item 8 (`ARCH-005`) is still low priority; nothing about slice 1, `S1-xx`, `N-xx`, or the re-ranking. `CLAUDE.md` tells every session to start here.
3. **One status icon carries three meanings.** The legend says "✅ detailed and Ready/Done", so a built item and a merely specified item look the same. The status words are inconsistent: Ready, Done, Built, Detailed Ready, Started (n of m), HOLD, SUPERSEDED, ADJUSTED, OBSOLETE.
4. **Epic roll-ups lag the items.** Examples: `EPIC-WEB-CUSTOMER` "none built yet"; `EPIC-ORDERING` "6 of 6 detailed, Ready" though built; `EPIC-LOCAL-DEV` "2 of 4"; `EPIC-CI-CD` "Not Started" though `CI-001` superseded and `CI-004` done; `EPIC-OBSERVABILITY` "Not Started" though tracing is built (`PORT-005`); `EPIC-PORTFOLIO-SLICE` "1 in progress".
5. **Item-level staleness**: the `ORD-001` queue row still says "`OrderPlaced` is not yet published" (published since `ORD-005`); `PORT-005` row says "in progress"; `PORT-004` still "blocked by PORT-002" though `PORT-002` is built; `ORD-003` partly built; `CAT-002` (customization flow) ⚪ but option selection exists in the web app.
6. **Misfiled item**: `AUTH-006` is listed under `EPIC-CATALOG`, not `EPIC-AUTH`.
7. **No handle for slice-1 work.** `S1-01` to `S1-09` and `N-01` to `N-15` live only in `docs/management/slice-1/03`; the outline does not mention them (ledger P-5).
8. **Peer-repo references** at lines 3, 328, 359, 424, 425 (`peer-A/...`): violates the no-reference decision.
9. **`PLAN-001` (prioritization) ⚪** while `slice-1/03` is in effect a prioritization with points; the two should be reconciled, and re-ranked against the demonstration goals.
10. **Outline gaps 1 to 9** are resolved history; gap 9 and gap 1 point to `PARKING-LOT.md` items that are themselves stale.

### Peer cross-checks done in this record
CI-01 (work-item template: every WI header carries its own status vocabulary, see Part B), CI-15 (parking lot: stale), CI-09 (surprise-as-trigger visible in outline gaps 4 to 6, a good public example), CI-36 (open questions answered by LOCAL-MILESTONES evidence), CI-17 (no promotion rule needed).

## Part B: work-item specs (in progress; batch 1: 30 of 67 read in full)

Read in full so far: `ARCH-001..004`, `AUTH-001`, `-002`, `-005`, `-006`, `CACHE-001..004`, `CAT-001`, `-003`, `-005`, `-006`, `CUST-002..006`, `DATA-001`, `-002`, `DEV-001..004`, `EVT-001`, `-003`, `GOV-001`, `MGMT-001`, `-002`, `-004`, `-005`.

Per-spec status (header `Status:` against the outline and facts):

| Spec | Header says | Reality (outline, facts) | Notes |
|---|---|---|---|
| ARCH-001..004, GOV-001, MGMT-004 | Done | Done | Consistent. ARCH-001 criteria name "Azure AD B2C" and "all 8 ADRs" (historical) |
| AUTH-001, AUTH-002 | Ready | Done (AUTH-002 2026-09-15) | Header stale |
| AUTH-005 | Done | Done | Has a revision note; Open Point promoted to register 24 |
| AUTH-006 | Proposed | Phase 1 built (progress note in the file) | Header not updated; note says "80 Auth tests", facts show 133 |
| CACHE-001, -003, -004 | Ready | Done | Header stale; CACHE-001 cites the external framework repo |
| CACHE-002 | Ready (unblocked) | Done 2026-09-15 | Header stale |
| CAT-001 | Done 2026-10-26 | Done | Good model: status line carries the commit and evidence path |
| CAT-003 | Ready | **Not built** (cache-aside; no catalog cache in service) | Correct as Ready; PORT-004 still waits on it |
| CAT-005 | Ready | Built 2026-10-28 | Header stale; has a long outcome note (best evidence in the file) |
| CAT-006 | Built 2026-10-28 | Built | Header correct; outcome note lists differences from spec |
| CUST-002 | Ready | Built (listing and detail with stock states) | Header stale; update note present |
| CUST-003 | Ready | Built | Header stale; body still requires Stripe.js/Elements, outcome note says stub payment (conflict inside one file); outcome note is a very strong evidence paragraph |
| CUST-004 | Ready | Built (order history not built) | Header stale; requirement for order history still in the criteria |
| CUST-005, -006 | Ready | Not built | Correct |
| DATA-001, -002, EVT-001, EVT-003 | Ready | Done | Headers stale |
| DEV-001 | Ready | Done 2026-09-15 | Header stale; body says `net8.0` (now `net10.0`) |
| DEV-002 | Done | Done | Scope note says compose also runs web and BFF "once they exist": they do not run in compose (D-1) |
| **DEV-003** | "Seed / fixture data script", Ready | Outline: DEV-003 is the **Stripe CLI** item (title-only) | **Duplicate of DEV-004.** The pre-renumbering file was copied, not renamed (activity log says it was renamed); two files with the same content and conflicting IDs |
| DEV-004 | Ready | Done 2026-10-27 | Header stale; the two notes at the top are accurate |
| MGMT-001, -002, -005 | Review | Plan refreshed; risk register 27 lines; budget 43 lines | "1 open decision" each; MGMT-001 open point (relative vs calendar) was decided in the plan text ("relative"); no one closed it |
| MGMT-004 | Done | Done | |

Patterns across the 30:
1. **Status drift in headers is the norm** (14 of 30 headers are stale). Newer items put a dated outcome note above the code fence; older ones kept the status line. There is no rule for which carries the truth.
2. **Outcome notes are the best evidence in the repo** (CAT-005, CAT-006, CUST-003, CUST-004, DEV-004 give what was built, what differs from spec, what was verified, what was not). They are in the wrong place for a reader (above the fence, before the spec), and they are not indexed anywhere.
3. **Specs cite the peer repos** (`CACHE-001`, `EVT-001`, `GOV-001` and others) against the no-reference decision.
4. **The template's conventions mostly hold:** categorized references, "you do not need to know", open points, AI suitability, DoD pointer. That is the work-item practice a reader can see; CI-01 (copy the template into bakery) is justified.
5. `WI-CAT-003` is genuinely unbuilt; `PORT-004` and the cache story for goal B depend on it.

### Part B, batch 2 (remaining 37 of 67; all 67 now read in full)

Read in full: `MGMT-007`, `-008`, `NFR-001`, `OPS-001`, `OPS-003`, `ORD-001..008`, `PORT-001..007`, `PREF-001`, `-002`, `PROD-001`, `QUE-001`, `-002`, `SEC-001`, `-003`, `SRCH-001`, `TOOL-001`, `-002`, `VEN-001`, `-002`, `WEB-001`.

| Spec | Header says | Reality | Notes |
|---|---|---|---|
| MGMT-007, -008, NFR-001, OPS-001, OPS-003, PROD-001 | Done | Done | Consistent |
| ORD-001 | Built, with a long outcome note | Built; `OrderPlaced` now also published (`ORD-005`) | Outcome note lists "not done: publishing OrderPlaced" (true when written, since fixed). Body still requires `POST /ordering/cart` (dropped by D-2) and "Stripe": conflicts inside one file |
| ORD-002 | Ready | Built | Header stale; the outcome note says the lifecycle differs from the criteria in the body (`Pending` state, actor/reason table, no `OrderCustomized`), so the body is wrong against the build |
| ORD-003 | Ready | Partly built (windows endpoint, schedule) | Three dated notes in non-chronological order (10-28, 10-28, 10-26) |
| ORD-004 | Done | Done | Consistent |
| ORD-005, -006 | Ready | Built | Headers stale |
| ORD-007 | "Ready for design iteration" | Built | Header stale |
| ORD-008 | Built (merged) | Built | Consistent |
| PORT-001 | Done | Done | |
| PORT-002, -003 | Ready | Built | Headers stale; notes updated |
| PORT-004 | Blocked (by PORT-002) | PORT-002 built; still unbuilt, now waits on `CAT-003` | Header stale |
| PORT-005 | Blocked (by PORT-002) | Built (progress note says so) | Header contradicts the note |
| PORT-006 | In Progress | Pass 2 table is **the work this review is doing** | See finding 7 |
| PORT-007 | Done 2026-10-28 | Done | Self-corrected: "the header was stale until then" |
| PREF-001, -002, SRCH-001, CUST-005, -006, QUE-001, -002, VEN-001, -002 | Ready | Not built | Correct. These carry vision principle 1 and the queue display: none exist |
| QUE-001 | Ready | Not built | Subscribes to five events including `OrderCustomized`, `PickupWindowScheduled`, `OrderReadyForPickup`, which `order-lifecycle.md` moved or removed: needs an adjusted note |
| QUE-002 | Ready (adjusted) | Not built | Cites ADR-0011 in references though adjusted note says Next.js |
| SEC-001 | Ready | Terraform key vault module exists; never planned or applied | Outline says "Done - reviewed"; verification is `terraform plan` which was never run: overclaim |
| SEC-003 | Ready | Done (Secrets tests 5 passed) | Header stale |
| TOOL-001 | Ready | Done (EventSchemas tests 16 passed) | Header stale; the payload list is now larger |
| TOOL-002 | Ready | Done and changed (inbound header no longer adopted) | The spec's code block shows the adopting version, contradicted by the reconciliation note and the code |
| WEB-001 | Ready | **Superseded** | Header stale; two notes explain it, body kept as record |

### Findings from the full read of all 67 specs

1. **Header status is unreliable:** of 67 headers, about 30 disagree with reality (Ready for built or done items; Blocked for built items; Proposed with built phase 1). Newer items carry the truth in a dated note above the code fence, older ones in the status line, a few in both. A reader cannot trust either.
2. **The best evidence is in the outcome notes** (what was built, how it differs from spec, how it was verified, what was not done). They are in the right idea, the wrong place, and are not collected anywhere. A generated "built and verified" table from these notes would be the strongest single artifact for goals A and B.
3. **Spec bodies contradict their own notes** for ORD-001 (cart endpoint, Stripe), ORD-002 (lifecycle), CUST-003 (Stripe.js), CUST-004 (order history), TOOL-002 (correlation header), QUE-001 (events). Policy ("do not rewrite historical specs") is right; the fix is a standard banner "Built differently: read the outcome note" and a status that says so, not edits to the body.
4. **A duplicate with the wrong ID:** `WI-DEV-003.md` is the seed-script spec (old numbering) while the outline's DEV-003 is the Stripe CLI item.
5. **Specs cite files that do not exist:** `worklog-2026-09-07.md` (several) and the external template repo. (`local-demo-execution-plan.md` does exist, at the repo root: an earlier draft of this record wrongly called it missing; see the root record.)
6. **Formats differ:** `PORT-001..007` use Markdown headings; the rest use a fenced header block. Both are fine; one should be chosen when the template is copied in (CI-01).
7. **`WI-PORT-006` pass 2 is this review.** Its register table (data model, DDD files, C4, ADR-0010 versus slnx, NFRs, process docs, plan, roadmap, budget, index/README/project-log, compose, infra, apps/services/tools) overlaps almost exactly. Closing the item should cite the review records; the table's rows can be dispositioned by reference. The status line "In Progress" is correct until then.
8. **Obvious unbuilt work that the demonstration goals need**, as specs that already exist: `CAT-003` (cache-aside for goal B's caching story), `PORT-004` (three-layer cache contract), `QUE-001`/`QUE-002` (queue display and shared pattern), `PREF-001/002`, `SRCH-001`, `CUST-005/006` (the dietary-safety principle). `FLAG-001`, `OBS-003`, `OPS-002`, `PLAN-001` are title-only.
9. **Vendor onboarding specs (`VEN-001/002`) have no consumer in the demo**; seed script substitutes. The spec text says so on purpose.
10. **Peer references** (CI-01 and others): `CACHE-001`, `EVT-001`, `GOV-001`, `PORT-006`-adjacent, `MGMT` documents cite the framework repo.

### Dispositions for Part B
- KEEP all 67 as history.
- ADD to each file a one-line banner with the true status and, where built, a pointer to the outcome note (mechanical, no body edits).
- DELETE `WI-DEV-003.md` or turn it into the real Stripe CLI stub (decision needed).
- GENERATE a status table (id, true status, evidence link) to replace per-file status as the authoritative reading; the outline then links to it.
- COPY-IN CI-01 (work-item template) with bakery's own status vocabulary.


## Part C: batch curation, reconciliation records, delegation packets, worklogs

Read in full: `BATCH-5-CURATION.md`, `RECONCILIATION-2026-09-28.md`, `docs/product/backlog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-25.md` and `-10-26.md`, `docs/history/sept-2026-delegation/` (README, packets 01 to 07, `WAVE-2-NOTES.md`), `docs/history/worklogs/worklog-bakery-extract-2026-09-28.md` (519 lines), `docs/history/worklogs/supersession-2026-09-28.md`, the two worklog `README`s. `docs/history/worklogs/worklog-coordination-2026-09-28.md` (1,152 lines) was read in full as the byte-identical copy in the framework repo; it differs from the bakery copy by one line (the bakery copy says "readers of the repository" where the others name a different audience).

| File | Purpose | Status and authority | Conflicts and gaps | Disposition |
|---|---|---|---|---|
| `BATCH-5-CURATION.md` (62) | Curated Batch 5 (PREF, VEN) and the renaming note | Historical; its own update line says all four items are detailed | "Batch 5" is September agent-batching vocabulary; all four items are still unbuilt, so the grouping of unbuilt work is still valid, but nothing says so | ARCHIVE (the grouping survives in the outline) |
| `RECONCILIATION-2026-09-28.md` (44) | Proposal record (status drift A, code findings B, tooling C, decisions D) | "Findings are proposals" | Answered by the 10-25 dispositions; the file itself still reads as open | KEEP with a closing pointer to its dispositions |
| `RECONCILIATION-DISPOSITIONS-2026-10-25.md` (47) | Verified dispositions of the 09-28 proposals | Official record | States A1 to A8, B1 to B5 with evidence. **B2** (Redis Streams transport swallows deserialization errors, no `XAUTOCLAIM`) is still an open gap (also local-dev known gap 4); **B4/B5** low-priority backlog unaddressed | KEEP |
| `RECONCILIATION-DISPOSITIONS-2026-10-26.md` (80) | Pass 1 of `WI-PORT-006`: adoption of ADR-0012 to 0016 and dispositions of about 25 backlog items | Official record | The best single document on how decisions and drift were handled (decisions table, defects fixed on import, item dispositions, deferred rows, noted-not-acted-on). Section F admits WI headers are stale. Section E (deferred rows) is what this review is doing | KEEP; feature in the method record |
| `docs/history/sept-2026-delegation/README.md` (44) | Explains packets and the first wave | Historical | Says "four packets this round"; later waves are in `WAVE-2-NOTES.md`; "once this wave lands" is long done | ARCHIVE with the packets |
| Packets 01 to 04 (34 to 41) | First wave (scaffold, adapters, event transport and ownership, mock issuer) | Historical, all built | Level not declared (levels came later). Packets 01 and 04 carry "check ... and flag" instructions, the pattern the playbook later called a defect | ARCHIVE |
| Packet 05 (44) | Rebuild of the mock issuer after packet 04 turned out to be a data record only | Historical; the incident behind the "status as a stated fact" rule | Still says "check whether anything beyond MockUser.cs was added since": an investigation instruction; it is the record of the lesson (copy-in CI-30) | ARCHIVE; cite as the origin of the rule |
| Packets 06, 07 (35, 53) | Fulfillment seam; three independent domain items | Historical | 07 carries "flagged, not resolved" decisions that later became facts (vendor status stored as documents, not a cache) | ARCHIVE |
| `WAVE-2-NOTES.md` (36) | Why packets 05 to 07; Wave 3 candidates | Historical | Wave 3 (DEV-002/004, ORD-002/003, PREF-002/VEN-002, CAT-003) was never packaged as packets: the work was done in interactive sessions instead | ARCHIVE |
| `docs/history/worklogs/worklog-bakery-extract-2026-09-28.md` (519) | BAK-001 to 015, STD-001 to 005: strategy, constraints, local-first, standards sweeps | "Tracking input only. Not an ADR, not a work item" | **Many items are now done or decided but still read Proposed/Open**: BAK-002 (Entra decided, ADR-0006 amendment), BAK-010 (local walking skeleton built), BAK-011 (local tooling built), BAK-013 (evidence format built: `summarize-results`), BAK-005 (this review), BAK-006 (ADR-0009). **Unaddressed and relevant to the demonstration goals**: BAK-012 (chaos scenarios as a visible capability: only the cache decorators exist), BAK-014 (ephemeral environments), STD-001/002/003 (supply chain: lock files exist; no SBOM, no dependency or secret scanning), STD-004/005 (data lifecycle, RTO/RPO: not done). A tool citation artifact is left in BAK-002 | ARCHIVE with a status-sweep note; lift the live items (BAK-012, BAK-014, STD-002/003) into the plan |
| `docs/history/worklogs/worklog-coordination-2026-09-28.md` (1,152) | Cross-repo coordination ledger | "Not authoritative for any repo" | Same file as in the peer repos by design; says V2 is the plan (deferred, not followed: lead's disposition 2026-10-29). Statuses frozen at 2026-09-28. Names the other repos throughout | ARCHIVE (one copy only, with the V2 disposition note) |
| `docs/history/worklogs/supersession-2026-09-28.md` (19), `worklog/README.md` (6), `docs/product/backlog/reconciliation/README.md` (4) | Supersession note; folder stubs | Supersession says "Status: Proposed. Confirm on merge" | The 10-25 record applied it; the status line was never closed. The two READMEs say "V2 exploration" | ARCHIVE |

### Findings from Part C

1. **Five overlapping progress trackers:** `local-demo-execution-plan.md` (root, "as of 2026-09-16", checkboxes mostly unchecked for built items), `LOCAL-MILESTONES.md` (M1 to M5), `project-plan.md` phases, `slice-1/01..03`, and the outline. One demo-milestone table should survive; the rest should point to it or be archived.
2. **The reconciliation habit is the repo's strongest process evidence** (the two dispositions records, activity-log entries on numbering collisions and drift, "header was stale until then" self-corrections). It is buried in `reconciliation/`. For goal A (quality of process) and goal B (written technical direction), surface it.
3. **The delegation packets are historic and contain the origin story** of "state status as a fact"; the slice-1 method (interactive, gated) replaced them. Keep, label, explain.
4. **B2 (the event transport loses messages it cannot deserialize) has been open since 2026-09-28**; it matters for the outbox story and for any consumer (`QUE-001`). It is only referenced in the register; check when the register is reviewed.
5. **Worklog items relevant to the demonstration goals but not planned in the backlog:** BAK-012 (chaos scenarios with evidence), BAK-014 (ephemeral environments), STD-002 (supply chain), STD-003 (secure SDLC), STD-004 (data lifecycle). They map to goal A (quality architecture, CI) and, for the cloud part, to priority 4.

## Product folder: dispositions summary

KEEP: `vision`, `personas`, the 67 WI specs (as history, with banners), the two dispositions records, `RECONCILIATION-2026-09-28` (with a pointer). REWRITE: `roadmap`, `okrs` (or archive until real), `backlog/README`, `LOCAL-MILESTONES`. SPLIT/REWRITE: the outline (current plan versus epic catalog). UPDATE: three `EPIC-*` files. ARCHIVE: `PARKING-LOT`, `BATCH-5-CURATION`, `docs/history/sept-2026-delegation/`, `worklog/` (one copy of the coordination worklog only), `local-demo-execution-plan.md` once superseded. CREATE: a status table generated from the WI banners; the work-item template (CI-01).
