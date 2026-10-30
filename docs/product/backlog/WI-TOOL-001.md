> **Status:** Done · evidence: `tools/BakeryMarketplace.EventSchemas` and its tests

```
WI ID:               TOOL-001
Title:                Domain event payload records (/tools/event-schemas)
Type:                 Interface/Contract
Epic:                 EPIC-SHARED-TOOLING
Shared with epic(s):  EPIC-EVENTING (payload types are consumed by EVT-002/003 once built)
Hat/Owner:            Platform Engineering
Status:               Done
Size:                 S
```

**Context / Why**
`EVT-001` defined the generic `DomainEventEnvelope<T>` shape but not the concrete `T` for each named domain event. This item defines those payload types — pure data, no behavior — so every producer/consumer of a given event agrees on its shape. **Fully independent of batch 1**: does not reference `ICacheProvider`, `IRepository<T>`, or `IEventPublisher`/`IEventSubscriber` at all, so it carries zero risk of interface-drift rework regardless of what those items' actual implementations turn out to look like.

**Inputs / References**
- *Decisions*: `docs/architecture/ddd/glossary.md` (the authoritative list of event names and what each represents), `docs/architecture/ddd/event-storming.md` (the 4 events this exercise itself named — `ReviewSubmitted`, `PayoutReconciled`, `ListingApproved`, `ListingRejected`), ADR-0010 (C# records)
- *Interfaces*: `DomainEventEnvelope<T>` (from `EVT-001`'s spec) — this item only needs the *shape* of that generic wrapper as documented, not a working implementation of it
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: not applicable — these are data records, not testable behavior
- *Business context*: `docs/architecture/data-model-api-contracts.md` (field names for each event's payload should match the aggregate fields already documented there)

**You do not need to know about**
- Any interface implementation from batch 1 (`CACHE-001`, `EVT-001`, `DATA-001`, `AUTH-001`) — this item only needs their documented *signatures*, and only `EVT-001`'s envelope shape at that
- Any service's business logic beyond what's needed to know a payload's field names

**Out of scope**
- Does not implement `IEventPublisher`/`IEventSubscriber` — those are separate, not this item's job
- Does not decide schema versioning mechanics beyond what ADR-0003 already states (additive-only, new versioned type name for breaking changes) — just applies that rule if a payload needs a v2 later

**Requirements / Acceptance Criteria**
- One C# record per named domain event, matching glossary names exactly:
```csharp
public record OrderPlacedPayload(string OrderId, string CustomerId, string VendorId, IReadOnlyList<LineItemPayload> LineItems);
public record OrderCustomizedPayload(string OrderId, IReadOnlyList<LineItemPayload> UpdatedLineItems);
public record PickupWindowScheduledPayload(string OrderId, DateTimeOffset WindowStart, DateTimeOffset WindowEnd);
public record OrderReadyForPickupPayload(string OrderId);
public record OrderCompletedPayload(string OrderId, DateTimeOffset CompletedAt);
public record VendorVerifiedPayload(string VendorId);
public record VendorSuspendedPayload(string VendorId, string Reason);
public record ListingPublishedPayload(string ListingId, string VendorId);
public record ListingSponsoredPayload(string ListingId);
public record ListingApprovedPayload(string ListingId);
public record ListingRejectedPayload(string ListingId, string Reason);
public record ReviewSubmittedPayload(string ReviewId, string OrderId, string VendorId, int Rating);
public record PayoutReconciledPayload(string PayoutId, string VendorId, decimal NetAmount);
public record LowStockDetectedPayload(string ListingId, string VendorId);

public record LineItemPayload(string ListingId, IReadOnlyList<string> ModifierIds, int Quantity);
```
- Each record's fields trace to `data-model-api-contracts.md`'s existing document shapes — no invented fields
- Placed in the shared `BakeryMarketplace.EventSchemas` class library (per ADR-0010's solution structure), referenced by every service project

**Dependencies**
- Blocks: `EVT-002`/`EVT-003` (the actual transport implementations will publish/consume these payload types)
- Blocked by: none
- Can be worked in parallel with: everything, including all of batch 1 — no shared code

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. Pure data-shape synthesis from the glossary and existing data model — no judgment calls, no dependency on unverified code.

**Open Points (working)**
*(none currently)*
