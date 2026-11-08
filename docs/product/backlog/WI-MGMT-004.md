> **Status:** Done · evidence: `docs/process/engineering-standards.md`

> **Update 2026-11-08 (documentation pass):** `docs/project-log.md` was archived on 2026-10-30; a new contributor now starts at `docs/index.md`, `docs/product/backlog/current-plan.md` and `STATUS.md`.

```
WI ID:               MGMT-004
Title:                Draft engineering standards (PR/review guidelines, onboarding)
Type:                 Document/Artifact
Epic:                 EPIC-PM-ARTIFACTS
Shared with epic(s):  none
Hat/Owner:            Manager/Lead
Status:               Done
Size:                 S
```

**Context / Why**
`docs/process/engineering-standards.md` lists three bullet-point headings with no content. Definition of Done and Definition of Ready already exist as separate, real documents — this item covers what's left: PR/review expectations and onboarding, plus the secure-coding baseline already flagged in `nfrs.md`.

**Inputs / References**
- *Decisions*: none new — this synthesizes existing project conventions rather than deciding anything
- *Interfaces*: none
- *Environment/tooling*: `docs/product/backlog/PARKING-LOT.md`/work-item template's own practices (categorized references, stating assumptions up front) are a natural source for review-guideline content, since they've been used successfully throughout this project
- *Test/chaos methodology*: not applicable
- *Business context*: `docs/architecture/nfrs.md` §3.4 (injection-protection baseline, explicitly deferred to this document)

**You do not need to know about**
- Any specific service's business logic — this document is about process, not domain content

**Out of scope**
- Does not pick a specific linter/formatter tool — that's a technical tooling decision, not a process-guidelines one; flagged as a separate open item if wanted
- Does not restate Definition of Done/Ready — references them

**Requirements / Acceptance Criteria**
- PR guidelines: expected size, what a reviewer checks (traces to an ADR/work item, not just "looks right"), merge criteria
- Onboarding: how a new contributor (human or AI agent) should orient — start at `project-log.md`, then the relevant ADRs, then the specific work item, using its categorized references — not "read the whole repo"
- Secure coding baseline: injection-protection (parameterized/ORM-based Cosmos queries), pulled in from `nfrs.md` §3.4 as promised there

**Dependencies**
- Blocks: none · Blocked by: none · Parallel with: any other Document/Artifact item

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes — fully derivable from existing project conventions and documents.

**Open Points (working)**
*(none currently)*
