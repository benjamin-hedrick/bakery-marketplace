> **Status:** Ready

```
WI ID:               PREF-002
Title:                Publish Preference Snapshot via Open Host Service (Search + Ordering)
Type:                 Integration
Epic:                 EPIC-PREFERENCES
Shared with epic(s):  EPIC-ORDERING (ordering-service consumes the snapshot to know a customer's constraints at checkout time)
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 S
```

**Context / Why**
The bounded context map names an Open Host Service relationship from Preferences to both Search and Ordering (`docs/architecture/ddd/bounded-contexts.md`), and the glossary already defines **Preference Snapshot** as "the published, point-in-time view of a Preference Profile shared with Search and Ordering via Open Host Service" — but no event or interface was ever named for it. This item names and builds that publication step, now that `PREF-001` gives it a real profile to publish from.

**A new event surfaced while detailing this item, named here rather than left implicit** (the same discipline `ARCH-004`'s event-storming pass used when it found four unnamed events): **`PreferenceSnapshotPublished`**. Search's consumption is in-process (Preferences and Search are both hosted in `catalog-service` per ADR-0009 — the modular monolith rule still requires going through this same published contract, just as an in-process call rather than over the event backbone). Ordering's consumption is genuinely cross-service and goes over the real event backbone (`EVT-001`/`EVT-003`).

**Requires two small additive updates to already-committed artifacts, done as part of this item rather than deferred**:
- `docs/architecture/ddd/glossary.md`'s "Key domain events" list gains `PreferenceSnapshotPublished`.
- `docs/architecture/data-model-api-contracts.md` gains this event in `catalog-service`'s Publishes list and `ordering-service`'s Consumes list.

Both edits are included in this reconciliation pass — see the updated copies of those two files.

**Inputs / References**
- *Decisions*: bounded context map's Open Host Service relationships (Preferences → Search, Preferences → Ordering), ADR-0003 (envelope, at-least-once/no-ordering — this event follows the same rules as every other domain event), ADR-0009 (modular monolith rule — Search's in-process consumption still goes through this same published shape)
- *Interfaces*: `IEventPublisher`/`IEventSubscriber` (`EVT-001`/`EVT-003`), `PreferenceProfile` (`PREF-001`)
- *Environment/tooling*: local event backbone (`DEV-002`)
- *Test/chaos methodology*: reuses `EventTransportContractTests` indirectly via `EVT-003`; this item's own tests confirm the profile's changes actually get wrapped and published, and that Search's in-process consumer sees the same shape a cross-service consumer would
- *Business context*: `docs/architecture/ddd/glossary.md` (Preference Snapshot, Preference Profile)

**You do not need to know about**
- `SRCH-001`'s actual filtering logic — this item only makes the snapshot available, it doesn't consume it for ranking
- `ORD-001`/`ORD-002`'s cart/order logic — this item publishes the snapshot; how (or whether) checkout actually surfaces an allergy warning at that point is out of scope here (see Out of scope)

**Out of scope**
- Does not implement any allergy-warning UI or checkout-time blocking logic in `ordering-service` — that consumption is a future item (candidate: an `ORD-*` or `NOT-*` item, not yet scoped) once this snapshot actually exists to consume
- Does not build a versioned/historical snapshot store — "point-in-time" here means "most recently published," not an audit trail of every historical snapshot
- Does not change `PREF-001`'s API surface or `PreferenceProfile` shape

**Requirements / Acceptance Criteria**
- New payload record added to the already-delivered `BakeryMarketplace.EventSchemas` package (additive only, per ADR-0003's schema-versioning rule — no existing payload record is touched):
```csharp
public record PreferenceSnapshotPublishedPayload(
    string CustomerId,
    IReadOnlyList<string> Allergies,
    IReadOnlyList<string> DietaryPreferences,
    DateTimeOffset SnapshotAt
);
```
- Every successful `PUT /catalog/preferences/{customerId}` (`PREF-001`) triggers a `PreferenceSnapshotPublished` event wrapped in a `DomainEventEnvelope<T>` and published via `IEventPublisher`, per-aggregate-sequenced by `customerId` (same pattern as every other event)
- Search's in-process consumer (within `catalog-service`) subscribes to the same published contract — the modular monolith rule from ADR-0009 applies even though no network hop is needed
- `ordering-service` subscribes via `IEventSubscriber` and stores the latest snapshot per `customerId`, keyed for lookup at checkout time (the actual checkout-time consumption logic itself is out of scope, per above — this item only gets the data there)
- Integration test proving: a profile update publishes exactly one snapshot event with current field values; a subsequent update publishes a new snapshot, not an accumulating diff

**Dependencies**
- Blocks: `SRCH-001` (needs a real snapshot feed to filter against), any future checkout-time allergy-warning item
- Blocked by: `PREF-001`, `EVT-003`
- Can be worked in parallel with: `VEN-002`

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: confirm `glossary.md` and `data-model-api-contracts.md` were actually updated with the new event name as part of this item's completion, not left for a later pass — same check `ARCH-004` used for its own newly-named events.

**AI-agent suitability**
Yes. The new event's shape follows the same envelope/payload pattern already established by every other domain event; no open judgment call remains once the event name itself is confirmed.

**Interfaces consumed**: `IEventPublisher`/`IEventSubscriber` (`EVT-001`/`EVT-003`), `PreferenceProfile` (`PREF-001`)
**Events published/consumed**: publishes `PreferenceSnapshotPublished`; no other event consumed
**Data touched**: none new in `catalog-service` beyond what `PREF-001` already owns; `ordering-service` gains a small snapshot-lookup store (implementation detail — a `CacheProvider` entry keyed by `customerId` is a reasonable default, consistent with how the event-dedupe store and `CAT-001`'s vendor-verification-status question were both resolved, but not mandated here)

**Open Points (working)**
*(none currently)*
