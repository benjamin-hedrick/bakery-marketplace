> **Status:** Deferred · trigger: a later session, after the documentation review pull request has merged (decided by the lead on 2026-10-30)

```
WI ID:               REPO-003
Title:                Review how deferred items, set-aside notes and ideas, and delegated-work findings are captured
Type:                 Document/Artifact
Epic:                 EPIC-REPO-OPS
Shared with epic(s):  none
Hat/Owner:            Manager/Lead
Status:               Deferred
Size:                 M
```

> Created 2026-10-30 at the lead's request. The parking lot (`docs/product/backlog/PARKING-LOT.md`) was set up in September; the way of working has changed a great deal since, and several mechanisms now overlap.

**Context / Why**
Things get deferred, set aside or noted in many places: the parking lot, the open-items register, deferred and proposed specs (`STATUS.md`), the open points inside work items, dated notes on ADRs, evidence records, commit messages and pull request text, and the assistant's own persistent notes. It is not clear which a given item should go to, when it should move, or how to avoid the same thing being recorded twice. A second gap is intake: when delegated work is submitted, what it returns (assumptions made, things it noticed and did not fix, decisions it deferred, surprises) has no fixed place or format, so it relies on someone remembering to transcribe it.

**Inputs / References**
- *Decisions*: the surprise rule and context completeness (`docs/method/surprise-rule.md`, `docs/method/context-completeness.md`: the "refine" step is where captured information goes back), register item 50 (the activity log, closed) and item 90 (checks that are not enforced).
- *Interfaces*: the register-item template (`docs/method/register-item-template.md`), the work-item template's open points, `docs/product/backlog/PARKING-LOT.md`.
- *Evidence*: how the register and parking lot were actually used between September and October 2026.
- *Business context*: `docs/method/ai-collaboration.md` (the handoff failure modes).

**You do not need to know about**
- The product code.

**Out of scope**
- Replacing the register or the spec statuses; building tooling beyond a small script or checklist.

**Requirements / Acceptance Criteria**
- An inventory of every place deferred, set-aside or noted information is kept today, with what each is for and how many live items it holds.
- A short rule set: where each kind of item goes (an idea, a question for later, a deferred feature, a limitation accepted on purpose, a defect found and not fixed, a decision someone else must make), when it moves, and how a duplicate is avoided.
- A decision on the parking lot: keep (with a defined role), merge into the register or the specs, or retire; its current items dispositioned.
- A delegated-work return format: what a delegate submits besides the change (assumptions made, items noticed and not fixed, decisions deferred, surprises, commands run and results), and where each part is recorded on receipt. Include a lightweight session-end check for the assistant.
- Written up in `docs/method/`, with the glossary and the onboarding path updated, and anything the review finds that is not fixed recorded in the register.

**Dependencies**
- Blocked by: none. Best done after the reconciliation pass so the review sees the settled structure.
- Related: register items 50, 90 and 93; `WI-PLAN-001`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Partial. The inventory and drafting are agent work; what counts as an idea versus a deferral, and the final shape, are the lead's decisions.

**Open Points (working)**
- [ ] Should a transient idea be allowed to live only in a session note, or must every idea be captured somewhere durable?
- [ ] Whether "Deferred" specs and register items with a trigger should be one list.
