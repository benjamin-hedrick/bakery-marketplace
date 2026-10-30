# Work item template

> **Status:** Current · defined 2026-10-30. Statuses are defined in `status-and-supersession.md`.

Copy this into `docs/product/backlog/WI-<AREA>-<NNN>.md`. Check the backlog for ID collisions first (`git grep "WI-<AREA>-<NNN>"`).

```
> **Status:** Ready

WI ID:                <AREA>-<NNN>
Title:                <short title>
Type:                 <Service Implementation | Library | Frontend | Docs | Decision | ...>
Epic:                 EPIC-<NAME>
Shared with epic(s):  none
Hat/Owner:            <role>
Size:                 <S | M | L>
```

**Context / Why**
Why the item exists and what it enables.

**Inputs / References**
- *Decisions*: ADRs that bind this item
- *Interfaces*: interfaces and contracts it uses or provides
- *Environment/tooling*: what must run locally
- *Test/chaos methodology*: how it is verified
- *Business context*: domain documents

**You do not need to know about**
- Things an implementer can safely ignore, so the scope stays narrow

**Out of scope**
- What this item deliberately does not do, with the item that does

**Requirements / Acceptance Criteria**
- Testable statements; each is checkable by a command or an observation

**Dependencies**
- Blocks: ...
- Blocked by: ...
- Can be worked in parallel with: ...

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Full, partial or none, and which decisions an agent must flag instead of choosing silently.

**Interfaces consumed**: ...
**Events published/consumed**: ...
**Data touched**: ...

**Open Points (working)**
- [ ] A question, with who decides. Mark `[x]` and add **Resolved <date>:** and the answer when settled.

## Notes added later

An **Outcome note** (what was built, how it differs, how it was verified, what was not done) goes above the spec when the item is built. A built spec's body is rewritten to what exists, with a short "Changes from the original plan" section.
