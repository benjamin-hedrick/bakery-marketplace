```
WI ID:               CAT-001
Title:                Listing CRUD + modifier/allergy-flag model
Type:                 Service Implementation
Epic:                 EPIC-CATALOG
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 M
```

**Context / Why**
Core Catalog & Customization functionality per the glossary and `data-model-api-contracts.md` — Listings, Modifiers, Allergy Flags. This is also where the vendor-verification publish gate lives (ADR-0009/`data-model-api-contracts.md`: catalog-service consumes `VendorVerified`/`VendorSuspended` to gate `Published` status), which creates a real local-dev dependency question — see Open Points.

**Inputs / References**
- *Decisions*: ADR-0004 (`catalog` container, `vendorId` partition key), ADR-0006 (Vendor role + ownership check)
- *Interfaces*: `IRepository<T>`/`CosmosRepository<T>` (`DATA-002`), `IEventSubscriber` (`EVT-001`/`EVT-003`), `AUTH-002`'s ownership-check pattern
- *Environment/tooling*: local Cosmos emulator, local event backbone (`DEV-001`)
- *Test/chaos methodology*: standard unit + integration tests, no adapter/chaos pattern (this is domain logic, not a swappable backend)
- *Business context*: `docs/architecture/ddd/glossary.md` (Listing, Modifier, Allergy Flag), `data-model-api-contracts.md`

**You do not need to know about**
- Search/ranking logic (`SRCH-*`) — this item exposes raw CRUD, filtering/ranking is a separate consumer
- Advertising/sponsored-slot logic beyond storing the `sponsored` boolean field

**Out of scope**
- Does not implement dietary-preference filtering at query time (`SRCH-001`)
- Does not implement the full admin-service moderation queue (`ADM-*`) — only consumes the two events that gate publish state
- Does not implement cache-aside reads (`CAT-003`, separate)

**Requirements / Acceptance Criteria**
- `Listing` document per `data-model-api-contracts.md`: `id, vendorId, name, description, price, category, modifiers[], allergenFlags[], sponsored, status, createdAt, updatedAt`
- Endpoints: `GET /catalog/listings`, `GET /catalog/listings/{id}`, `POST /catalog/listings` (Vendor role), `PUT /catalog/listings/{id}` (Vendor role + ownership check via `AUTH-002`'s pattern)
- A listing can only reach `Published` status if its owning vendor's tracked status is `Verified` — set via consuming `VendorVerified`/`VendorSuspended` events, not by trusting a client-supplied flag
- Consuming `VendorSuspended` for an already-`Published` listing's vendor prevents further publish actions for that vendor (existing published listings' handling can follow the simplest correct behavior — reject new publishes, don't force-unpublish — unless you decide otherwise; state your choice)

**Dependencies**
- Blocks: `CAT-003`, `ORD-001` (needs listings to exist)
- Blocked by: `DATA-002`, `EVT-003`, `AUTH-002`
- Can be worked in parallel with: `ORD-004`, `ORD-002`, `ORD-003`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Partial. The CRUD/model/event-consumption logic is fully agent-suitable. The "where does catalog-service store per-vendor verification status derived from events" question (see Open Points) is a small real design choice not yet decided anywhere — flag it rather than pick silently if assigned to an agent.

**Interfaces consumed**: `IRepository<T>` (`DATA-002`), `IEventSubscriber` (`EVT-003`)
**Events published/consumed**: consumes `VendorVerified`, `VendorSuspended`; publishes `ListingPublished`, `ListingSponsored`
**Data touched**: `catalog` container

**Open Points (working)**
- [ ] Where does catalog-service persist derived per-vendor verification status (a cache entry keyed by vendorId, a dedicated small read-model container, or a field checked at publish-time only)? Not decided in any ADR — reasonable default is a `CacheProvider`-backed entry (reuses `CACHE-002`, no new container), but confirm before treating as settled.
- [ ] For local end-to-end testing, no admin-service exists yet to publish `VendorVerified` for real. `DEV-003`'s seed step publishes this event directly onto the event backbone for seeded vendors, simulating what admin-service will do later — confirm this is acceptable as the interim local-dev path rather than blocking on `EPIC-ADMIN`.
