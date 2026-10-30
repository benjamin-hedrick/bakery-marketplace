> **Status:** Done · evidence: `docs/product/personas.md`

```
WI ID:               PROD-001
Title:                Draft personas / Jobs-to-be-Done
Type:                 Document/Artifact
Epic:                 EPIC-PRODUCT-STRATEGY
Shared with epic(s):  none
Hat/Owner:            Digital PM
Status:               Done
Size:                 S
```

**Context / Why**
`vision.md` names actors (Customer, Shop, Independent Vendor) but only gestures at them — no full persona treatment exists. This item expands the existing actors into real personas with goals, pain points, and Jobs-to-be-Done statements, without inventing new actors beyond what the glossary already defines.

**Inputs / References**
- *Decisions*: none new
- *Interfaces*: none
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: not applicable
- *Business context*: `docs/product/vision.md` (problem statement, who it's for), `docs/architecture/ddd/glossary.md` (actor definitions — Customer, Shop, Independent Vendor, Admin)

**You do not need to know about**
- Any technical implementation detail — this is a pure product-strategy artifact

**Out of scope**
- Does not invent new actors beyond the glossary's existing four
- Does not include a formal user-research methodology write-up — these are working personas for a portfolio project, not the output of real user interviews

**Requirements / Acceptance Criteria**
- One persona per glossary actor (Customer, Shop, Independent Vendor, Admin) — Courier is correctly excluded, since it's a v2/deferred actor per ADR-0001
- Each persona includes: goals, pain points, and a Jobs-to-be-Done statement ("when [situation], I want to [motivation], so I can [outcome]")
- Each persona's pain points connect to a specific product decision already made (e.g., the Customer persona's allergy concern connects to vision principle 1 and the Preferences bounded context) — not generic, interchangeable pain points that could apply to any marketplace

**Dependencies**
- Blocks: none · Blocked by: none · Parallel with: any other Document/Artifact item

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes — fully derivable from `vision.md` and the glossary.

**Open Points (working)**
*(none currently)*
