> **Status:** Done · evidence: `docs/architecture/data-model-api-contracts.md`

> **Update 2026-11-08 (documentation pass):** browsers reach the services through the GraphQL BFF, not API Management, and several sections are design only; the page now carries a status banner listing the divergences (`docs/architecture/data-model-api-contracts.md`).

```
WI ID:               ARCH-003
Title:                Data Model / API Contracts (per service)
Type:                 Document/Artifact
Epic:                 EPIC-ARCH-DOCS
Shared with epic(s):  none
Hat/Owner:            Architect
Status:               Done
Size:                 M
```

**Context / Why**
ADR-0004 named the Cosmos containers per bounded context; ADR-0009 decided which service hosts which context. Neither states the actual document shape or the API surface a frontend/gateway would call. This item makes both concrete, per service, so `EPIC-...` domain-feature work items have a real contract to build against instead of inventing field names ad hoc per item.

**Inputs / References**
- *Decisions*: ADR-0004 (containers, partition keys, consistency levels), ADR-0009 (service groupings), ADR-0003 (event names, at-least-once/idempotency requirement), ADR-0008 (all endpoints route through APIM)
- *Interfaces*: `Repository<T>`, `EventPublisher`/`EventSubscriber`, `CacheProvider` (all already defined at the interface level; this item shows what flows through them, not new interfaces)
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: not applicable
- *Business context*: `docs/architecture/ddd/glossary.md` (field names should match glossary terms exactly — Listing, Modifier, Preference Profile, etc. — not invented synonyms)

**You do not need to know about**
- Any other service's internal data shape beyond what's needed to understand a cross-service event or API call
- UI/frontend implementation — this is the contract, not the consuming code

**Out of scope**
- Does not decide API endpoint/URL versioning through APIM — already flagged as undecided in `PARKING-LOT.md`; this item's endpoint paths are illustrative, not a versioning scheme
- Does not build any actual code — this is the contract those future work items build against

**Requirements / Acceptance Criteria**
- One section per service (`catalog-service`, `ordering-service`, `admin-service`, `notification-service`), each with: owned Cosmos container(s) and document shape, events published/consumed, and API endpoints
- Every field name traces to the glossary — no invented terminology
- Explicitly resolves one previously-undecided detail: where the at-least-once-delivery dedupe/idempotency store (required by ADR-0003) actually lives — proposed: the existing `CacheProvider`, not a new mechanism
- Explicitly notes the vendor-side read-model split (ADR-0004's CQRS decision) as a second, denormalized container within `ordering-service`, distinct from the source-of-truth `orders` container

**Dependencies**
- Blocks: none directly, but every domain-feature epic (Catalog, Ordering, Admin, etc.) benefits from this existing before real implementation starts
- Blocked by: none
- Can be worked in parallel with: any other Document/Artifact item

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: every container/field should be checked against ADR-0004's aggregate list and the glossary for naming consistency, not just internal plausibility.

**AI-agent suitability**
Yes — every container, event, and service assignment already exists in prior ADRs; this item is synthesis into concrete shapes, not a fresh business decision.

**Open Points (working)**
*(none currently)*
