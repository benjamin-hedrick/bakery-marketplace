# Experiment: do the status checks catch a stale status? (2026-10-30)

> **Status:** Snapshot · 2026-10-30, tree at the commit before this record, run in a separate git worktree so the working tree was untouched. Theory test `G-H06` of the gap catalog: "status banners plus a generated table keep the repository consistent". **Current result:** partly. The checks catch a banner that disagrees with its header, a wrong epic count and a stale `STATUS.md`. They did not catch the status written in prose elsewhere; one regular form of it (21 mentions in `epic-catalog.md`) is now checked, and the rest is register item 99.

## Method

Work item `WI-CUST-007`, banner status Ready, was changed to Done in three steps, running `node scripts/docs/status.mjs --check` after each, then regenerating. Afterwards the documents that still say it is Ready were listed by searching for the id.

| Step | Change | What the check reported |
|---|---|---|
| A | The banner (line 1) only | The header `Status:` disagrees with the banner; the epic banner `EPIC-WEB-CUSTOMER.md` says 3 of 6 and the specs give 4 of 6; `STATUS.md` is out of date |
| B | Banner and header, nothing regenerated | The epic banner count; `STATUS.md` is out of date |
| C | `node scripts/docs/status.mjs` (regenerates `STATUS.md`) | `STATUS.md` is current; the epic banner mismatch still fails, so a person must correct that line |

`TRACEABILITY.md` was also reported out of date by its own check, since the status is part of what it lists.

## What was not caught

Documents that still described `WI-CUST-007` as Ready after step C and were not flagged:

- `epic-catalog.md` (its entry says "Detailed, Ready"),
- `docs/product/demo-milestones.md` ("the order history list (`CUST-007`, Ready)"),
- the wording of the `EPIC-WEB-CUSTOMER.md` banner and header beyond the count ("CUST-005, CUST-006 and CUST-007 Ready"; only the count is checked).

Register item 80, which tracks the work item, does not state a status, so it was not stale.

Of the 77 lines in `epic-catalog.md` that name a spec file, 21 state the status in one regular form (`` `WI-X.md` (Status, date) ``) and all 21 agreed with the banners on this date; the other 56 are free prose.

## Result and what changed

- `status.mjs --check` now also compares the 21 regular mentions with the banners (checked: it fails with `epic-catalog.md: WI-QA-001.md is marked "Ready" but its banner says "Done"` on a planted mismatch, and passes on the repository).
- The free-prose mentions in the catalog, `scope.md`, the plans and the register remain unchecked: register item 99 lists the options.
