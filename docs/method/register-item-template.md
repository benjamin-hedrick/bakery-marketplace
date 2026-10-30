# Register item template

> **Status:** Current · defined 2026-10-30. Status values are defined in `status-and-supersession.md`.

The open-items register (`docs/governance/open-items-register.md`) is the running list of anything found and not fixed in the same change. An item exists so a later session does not re-analyze it. Add an item in the same change that finds the problem, before the work item is called done.

## Shape

```
**N. Short title that names the problem, not the fix**
Type: <type> · Source: <where it was found, with the date> · Hat: <who would act on it>
Status: <status>
<What is wrong or unknown, in a paragraph: the evidence, the consequence, and what "reconciled" would mean.>
Resolution: <only when resolved: what was done, the date, and a pointer (commit, work item, evidence file).>
```

- **Numbering:** the next unused number. Numbers are never reused or changed, because work items, ADRs and evidence cite them.
- **Title:** states the problem in the present tense. When the item is resolved, the title is not changed.
- **Type:** new items use one of: Defect, Gap (missing capability or design), Limitation (known, with a reason), Risk, Decision (open or to amend), Deferred scope, Verification gap, Documentation drift, Process, Tracking (watching something). Items written before 2026-10-30 keep the type they were given.
- **Source:** a work item, an ADR, a review, an evidence file or a session, with the date. Say what found it.
- **Hat:** the role that would act (`Architect`, `Engineering/Build`, `Platform Engineering`, `Security`, `Product`, `Manager/Lead`).
- **Body:** facts first. Say what was run and what was only read. Name the file or test where it can be seen. If the fix needs a human decision (security, auth, scope), say so.
- **Updates:** a dated line (`Update 2026-10-28:`) appended to the body; do not rewrite earlier text. Statuses change; descriptions are history.

## Status values

| Status | Meaning | Written as |
|---|---|---|
| Open | Needs action or a decision, not started | `Status: Open` |
| Tracking | A known limitation or follow-up being watched; no action planned yet | `Status: Tracking` |
| Accepted | Risk or limitation accepted on purpose, with an owner | `Status: Accepted · owner: <hat>` |
| Deferred | Decided not now | `Status: Deferred · trigger: <what makes it worth revisiting>` |
| Resolved | Done, or no longer applies | `Status: Resolved <date>` and a `Resolution:` line with a pointer |

An item that is partly done keeps its status (usually Open) and gets an `Update` line saying what is done. Do not delete an item. If an item becomes a GitHub Issue, keep it and add the Issue link to the `Status:` line.

## Counting

`node scripts/docs/status.mjs` counts items by status and type into `docs/product/backlog/STATUS.md`. The first word after `Status:` must be one of the five values above.
