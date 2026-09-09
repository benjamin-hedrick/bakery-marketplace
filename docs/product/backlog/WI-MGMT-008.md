```
WI ID:               MGMT-008
Title:                Draft the branching/release strategy
Type:                 Document/Artifact
Epic:                 EPIC-PM-ARTIFACTS
Shared with epic(s):  none
Hat/Owner:            Manager/Lead
Status:               Done
Size:                 S
```

**Context / Why**
`docs/process/branching-strategy.md` is a one-line stub naming the open question (trunk-based vs. gitflow) but never answering it. This also feeds `EPIC-CI-CD`'s pipeline design, which can't be built correctly without this decided first.

**Inputs / References**
- *Decisions*: ADR-0003 (event schema versioning is already decided — additive-only, new versioned event type names — this item references that, doesn't re-decide it), `EPIC-FEATURE-FLAGS` (the mechanism that makes trunk-based development safe without long-lived branches)
- *Interfaces*: none
- *Environment/tooling*: `docs/architecture/tech-stack.md` (per-environment structure — dev/staging/prod — the branching strategy needs to map onto this)
- *Test/chaos methodology*: not applicable
- *Business context*: `docs/process/engineering-standards.md` (PR guidelines — this item's branch-naming convention should be consistent with that document's "PR maps to one work item" rule)

**You do not need to know about**
- Any specific service's code structure — this is a process decision, not a code-organization one

**Out of scope**
- Does not re-decide event schema versioning (ADR-0003 already covers it) — references it
- Does not decide API endpoint/URL versioning through APIM — a related but genuinely separate, not-yet-decided question, named explicitly rather than silently bundled in here (candidate for `PARKING-LOT.md` if it becomes a real blocker)
- Does not decide per-service semantic versioning — see Decision rationale for why a single repo-wide version is proposed instead

**Requirements / Acceptance Criteria**
- States trunk-based vs. gitflow explicitly, with reasoning, not just a label
- Defines branch naming convention tied to work-item IDs (consistent with `engineering-standards.md`'s PR-guidelines)
- Defines how a commit on `main` maps to deployment across dev/staging/prod (the promotion path)
- States the repo-wide versioning scheme and explains why per-service versioning was not chosen, given the modular-monolith grouping from ADR-0009

**Dependencies**
- Blocks: `EPIC-CI-CD`'s pipeline items benefit from this existing first (not a hard block, but real sequencing value)
- Blocked by: none
- Can be worked in parallel with: `MGMT-007`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes — this is a well-understood, defensible default (trunk-based + feature flags) given decisions already made elsewhere in the project (feature flags exist, CI/CD is per-environment); no fresh business judgment call required.

**Open Points (working)**
*(none currently)*
