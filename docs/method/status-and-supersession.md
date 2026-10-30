# Status and supersession

> **Status:** Current · defined 2026-10-30 (approved by the lead as drafted; amend after use)

One vocabulary for the status of work items, documents, ADRs and register items, and the only notes allowed on historical records.

## Work item and epic status

One word, in the `Status:` field of the work item header. The `STATUS.md` table is generated from these.

| Status | Meaning | Required beside it |
|---|---|---|
| Proposed | Suggested, not accepted | who decides |
| Ready | Accepted and specified (meets `docs/process/definition-of-ready.md`), not started | |
| In progress | Being built; may be partly built | what remains |
| In review | Content complete, waiting for a named decision or approval | the decision |
| Blocked | Cannot proceed | the named blocker |
| Built | Implemented; the verification its acceptance requires is not complete | the missing verification |
| Done | Acceptance criteria met and verified as the item requires (tests, a clean-agent or CI run where it applies), documents updated | evidence pointer |
| Deferred | Decided not now | the trigger to revisit |
| Superseded | Replaced | by which item |
| Obsolete | Cancelled, no longer needed | why |

"Adjusted" is not a status. It is a kind of note: requirements kept, implementation changed. Epic status is derived from its items and stated as counts ("6 of 8 done"), never typed by hand.

## Document status

A banner on the first line under the title:

- `> **Status:** Current · verified <date>`
- `> **Status:** Snapshot · <date>` (point in time, not maintained; say what supersedes it, if anything)
- `> **Status:** Superseded by <link>`
- `> **Status:** Historical` (kept as a record, in `docs/history/`)

Evidence files are snapshots and begin with a **Current result** line.

## ADR status

The status line holds only `Proposed`, `Accepted`, `Accepted, amended <date(s)>` or `Superseded by ADR-N`. It never carries validation or build progress: validation outcomes get a dated "Validation outcome" section, and build progress belongs to work items. Decision text is never edited; only the status line and appended dated notes change.

## Register item status

A `Status:` line under each item's `Type:` line: `Open`, `Tracking` (known limitation being watched), `Accepted` (with owner), `Deferred` (with trigger) or `Resolved <date>` (with a pointer). Numbering and text are kept.

## Notes

| Note | Where | Purpose |
|---|---|---|
| Status banner | first line of every work item and epic | the true status, one line |
| Outcome note | above a built spec | what was built, how it differs, how it was verified, what was not done |
| Reconciliation note | above a spec | adjusted, superseded or obsolete, with date and reason |
| Amendment note | bottom of an ADR | a dated change that does not alter the decision text |
| Supersession note | bottom of the superseded ADR or document, plus a status change | points to the replacement |

## Specs that differ from what was built

Git keeps the original, so a live spec is an accurate record. Decided 2026-10-30:

- A **Ready** spec is rewritten to the current design.
- A **built** spec has its body replaced with an as-built description plus a short "Changes from the original plan" section.
- Unbuilt parts of a partly built spec are split into their own Ready item.

No "built differently" banner: a banner saying the body is wrong is the confusing option.
