# Gap catalog

> **Status:** Current · created 2026-10-30. The record of what the October 2026 documentation review found missing, kept so that nothing needs to be analysed again.

| File | What it holds |
|---|---|
| [`target-map.md`](target-map.md) | 51 artifacts the review found missing or stale (T-01 to T-65), by tier, with the source to build each from and a rough size |
| [`gap-details.md`](gap-details.md) | 74 detail rows (G-D, G-A, G-C, G-T, G-S, G-E, G-H): the required content of each diagram, reference, checklist, template, standard, piece of evidence and theory to test |

Each row has a **State** (Done, Partly, Open, Dropped) and a **Tracked in** column. Open rows are tracked by a spec in `STATUS.md` (these specs are Deferred or Proposed and carry no commitment), by a register item, or by an entry in the epic catalog; the spec cites the row IDs it covers and its acceptance is that those rows are Done. A row is changed only by updating its State and Tracked-in cells. When all rows are Done or Dropped, both files move to `docs/history/`.

The review also proposed a competitive scan, a monetization model, a RACI and a team plan (the end of the target map): those are `WI-PROD-002`, `WI-PROD-003`, `WI-MGMT-003` and `WI-MGMT-006`. Product breadth beyond the first slice (real payments, notifications, vendor onboarding, the admin console, reviews, advertising) is in the epic catalog and is not part of this catalog.

The closing record of the review, with the disposition of every other finding, is `docs/history/review-2026-10/closing-record.md`.
