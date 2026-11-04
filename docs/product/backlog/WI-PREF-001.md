> **Status:** Ready

```
WI ID:               PREF-001
Title:                The customer's allergen profile (allergies and avoid)
Type:                 Service Implementation
Epic:                 EPIC-PREFERENCES
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 S
```

> **Rewritten 2026-11-04** (ADR-0022, the lead's decisions of the same day). Git keeps the original. What changed: the customer is the token's subject, not a path parameter (as for the order list, `WI-CUST-007`); the profile holds **allergen ids from the registry** in two lists, `allergies` (serious) and `avoid` (a preference), instead of two free-text arrays; `dietaryPreferences` moved to `TAG-004` (diet claims need diet tags on listings first); no snapshot event is published (`PREF-002` is superseded).

**Context / Why**
Personalization starts with a stored profile. A profile is a list of allergens the customer must avoid and a second list of allergens they would rather avoid, both chosen from the closed allergen list (`TAG-001`). It is quasi-health data (NFR 3.7): read and written only by its owner, never logged, never traced, never cached, never sent on the event backbone.

**Inputs / References**
- *Decisions*: ADR-0022 (ids, the closed list), ADR-0004 (`preferences` container, partition `customerId`), ADR-0009 (hosted in `catalog-service`), ADR-0006 (role plus ownership), ADR-0014 (`private, no-store`), NFR 3.7.
- *Interfaces*: `IRepository<T>` and the in-memory and Cosmos backends as for listings, `TAG-001`'s `ITagRegistry`, the order list's endpoint pattern (`OrdersEndpoints` in ordering) for the caller's identity.

**You do not need to know about**
- How the profile is used to match listings (`SRCH-001`) or shown (`CUST-005`, `CUST-006`).

**Out of scope**
- Diet preferences (`TAG-004`); a snapshot event or any copy of the profile in another service; deletion and retention policy beyond "clear it yourself" (`PRIV-001`, deferred).

**Requirements / Acceptance Criteria**
- Document `PreferenceProfile` in the `preferences` container: `id` (= the customer id), `customerId`, `allergies` (allergen ids), `avoid` (allergen ids), `updatedAt`.
- `GET /catalog/preferences` and `PUT /catalog/preferences`, Customer role only. The customer is always the token's subject: there is no customer id in the path or the body. A customer with no profile gets `200` with both lists empty; the first `PUT` creates it. `PUT` replaces both lists.
- Validation: every id is a public, active, non-retired allergen in the registry; an id in both lists, a duplicate, or more than the number of allergens is a 422 `validation_failed` naming the field. Nothing is silently dropped.
- Responses carry `Cache-Control: private, no-store`. The profile, its ids and its size are never in a log line or a span (the request body is never logged), proved by a test that captures logs and spans around a read and a write.
- BFF: `preferences: Preferences!` and `savePreferences(input): SavePreferencesPayload!` (mapping and error mapping only; a 401 is UNAUTHENTICATED, a 403 FORBIDDEN, a 422 a typed rejection with the field).
- **Abuse cases (acceptance criteria):** another customer's profile is unreachable (there is no way to name one); a vendor or admin token is refused (403) and no token is 401; an unknown, hidden, retired or non-allergen id is 422; an oversize body is refused; a repeat `PUT` is idempotent; nothing of the profile appears in telemetry.
- Tests: the endpoints against the in-memory backend, the Cosmos adapter against the emulator when it is up, the BFF mapping, and the abuse cases above, each shown to fail without its property.

**Dependencies**
- Blocks: `SRCH-001`, `CUST-005`.
- Blocked by: `TAG-001`.

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific: the contract document states the endpoint without a customer id.

**AI-agent suitability**
Yes. The access rule is the same role-plus-subject rule the order endpoints use, so no new authentication logic is introduced; the lead's review of the abuse cases is still wanted because the data is sensitive.

**Interfaces consumed**: `IRepository<T>`, `ITagRegistry`
**Events published/consumed**: none
**Data touched**: `preferences` container

**Open Points (working)**
*(none currently)*
