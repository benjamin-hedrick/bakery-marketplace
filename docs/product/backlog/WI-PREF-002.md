> **Status:** Superseded by `WI-PREF-001`, `WI-SRCH-001` and `WI-ORD-009`

```
WI ID:               PREF-002
Title:                Publish Preference Snapshot via Open Host Service (Search + Ordering)
Type:                 Integration
Epic:                 EPIC-PREFERENCES
Shared with epic(s):  EPIC-ORDERING
Hat/Owner:            Engineering/Build
Status:               Superseded
Size:                 S
```

> **Superseded 2026-11-04 by the lead's decision** (review of the personalization scope). The original (a `PreferenceSnapshotPublished` event carrying each customer's allergies, consumed in-process by Search and stored per customer by ordering for a later checkout-time warning) is in git. It is dropped, not postponed, for three reasons:
> - **Search needs no event.** Preferences and Search are both in `catalog-service`; the matching reads the profile through an interface (`SRCH-001`), which is what the modular-monolith rule (ADR-0009) asks.
> - **Ordering does not need a copy of the profile.** What the vendor and the safety metric need is the allergens **recorded on the order** ("the dietary constraints recorded on it", `docs/product/vision.md`; NFR 3.7: the vendor fulfilling the order may see them). The customer chooses them at checkout and they travel with that order only (`WI-ORD-009`, `WI-QUE-005`).
> - **Allergies do not belong on the event backbone as a standing profile.** They are quasi-health data (NFR 3.7); the lead's earlier decision keeps personal data off the backbone. The event stream would carry them for every profile save, readable by any consumer of the stream.
>
> The allergy-warning notification that waited on this item (register 138) is dropped with it: the useful warning is before the order is placed (`WI-CUST-008`), and the useful message to the bakery is the allergens on the order (`WI-QUE-005`), not an e-mail afterwards.

The glossary's "Preference Snapshot" entry and the `PreferenceSnapshotPublished` lines in `data-model-api-contracts.md` and the bounded-context map are historical; they are corrected with `TAG-001`'s documentation change.
