```
WI ID:               ARCH-001
Title:                C4 Diagrams — System Context + Container
Type:                 Document/Artifact
Epic:                 EPIC-ARCH-DOCS
Shared with epic(s):  none
Hat/Owner:            Architect
Status:               Done
Size:                 M
```

**Context / Why**
`docs/architecture/c4/context.md` and `container.md` exist only as stubs. The bounded context map (`docs/architecture/ddd/bounded-contexts.md`) already establishes the domain boundaries and integration patterns; C4 translates that into the standard architect-audience view (actors, external systems, containers, and how they talk to each other) that a reviewer expects to see rendered, not just described in prose. Scoped to Context + Container levels only — component-level diagrams for individual services are explicitly a separate, later item.

**Inputs / References**
- *Decisions*: ADR-0001 (fulfillment), ADR-0002 (cache), ADR-0003 (eventing), ADR-0004 (data store), ADR-0005 (payments), ADR-0006 (auth), ADR-0007 (secrets), ADR-0008 (API gateway) — every container and connector on these diagrams traces to one of these
- *Interfaces*: none consumed directly — this item visualizes existing interfaces (`CacheProvider`, `EventPublisher`, `Repository<T>`, `/tools/auth-middleware`), it doesn't define new ones
- *Environment/tooling*: `docs/architecture/tech-stack.md` — which concrete Azure services back each container
- *Test/chaos methodology*: not applicable — this produces diagrams, not testable code
- *Business context*: `docs/product/vision.md` (actors), `docs/architecture/ddd/bounded-contexts.md` (the context map this diagram is a projection of)

**You do not need to know about**
- Any domain business logic details beyond what's needed to label a box/connector correctly (e.g., you don't need to know the exact allergy-flag data model to draw the Catalog container, just that it exists and talks to Search)
- Component-internal structure of any single service — that's out of scope, see below

**Out of scope**
- Component-level diagrams for individual services (a later, separate item — candidates: `ordering-service`, `catalog-service`)
- Sequence/data-flow diagrams for specific business processes (e.g., checkout flow) — different diagram type, not C4, not this item
- Any diagramming tool decision beyond Mermaid (already established convention — see `c4/README.md`)

**Requirements / Acceptance Criteria**
- **Context diagram**: shows Customer, Shop, Independent Vendor, Admin actors; the platform as a single boundary; external systems (Stripe, Azure AD B2C) — matches the actors in the glossary and vision exactly, no invented actors
- **Container diagram**: shows all three frontend apps, all four backend services, the API Gateway (ADR-0008), the event backbone, the data store, the cache, and Key Vault — every connector between containers must trace to a real decision (e.g., "web-customer → APIM → catalog-service" per ADR-0008's routing, not an assumed direct connection)
- Both diagrams render as Mermaid blocks (per existing `c4/README.md` convention) so they display natively on GitHub and in the published MkDocs site with no plugin
- Each diagram is preceded by 2-3 sentences of orienting prose, not just a bare diagram

**Dependencies**
- Blocks: none directly, though a future component-level diagram item would naturally follow this
- Blocked by: none — all 8 ADRs already exist
- Can be worked in parallel with: any other Document/Artifact item (no code dependency)

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: every container and connector should be traceable to a specific ADR or the bounded context map — if a reviewer asks "why does this arrow exist," the answer should be a citation, not "it seemed right."

**AI-agent suitability**
Yes. All 8 ADRs plus the bounded context map fully specify every actor, container, and connector needed — no business judgment call remains unresolved the way NFR-001's target-load numbers did.

**Open Points (working)**
*(none — resolved: formalized as ADR-0009, see `docs/architecture/adr/0009-bounded-context-service-mapping.md`)*
