> **Status:** Done · evidence: the Outcome note under this banner; `tools/BakeryMarketplace.Seed`

```
WI ID:               DEV-004
Title:                Seed / fixture data script
Type:                 Infra/Environment
Epic:                 EPIC-LOCAL-DEV
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Done
Size:                 S
```

> **Reconciliation note (2026-10-26) — UNBLOCKED, with constraints found by WI-DEV-002.** `WI-DEV-002` is done and verified, so this item can now be built and run. Facts to design against (details in `docs/operations/local-dev.md`):
> - Seed events go onto the real Redis stream `events:{eventType}` as a JSON `envelope` field (camelCase), with the per-aggregate `sequenceNumber` that `catalog-service` uses to ignore stale events. `VendorVerified` for each seeded vendor works as built.
> - The `catalog` Cosmos container (partition key `/vendorId`) is created by `catalog-service` when `Cosmos:EnsureCreated` is on; the seed must create it too or run after the service has started once.
> - **Seed vendor ids must be reconciled with the mock users.** Ownership needs the token `sub` to equal the listing's `vendorId`, and the mock vendor's `sub` is `user-vendor-1`, so seed vendors such as `vendor-shop-001` cannot be edited by any mock user. Either seed with the mock user's id or add matching users to the issuer.
> - Use the deterministic ids and expected totals in `docs/architecture/first-slice-contract.md` §7. See `reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`.

> **Outcome note (2026-10-27) — built as `tools/BakeryMarketplace.Seed`.** Seeds 7 listings (6 Published, 1 Draft) for the two contract vendors and publishes `VendorVerified` for both; idempotent (verified by a second run on the real stack and by `SeederTests`). Deviations: (1) **preference profiles not seeded**: no preference model exists (`PREF-001`); (2) the contract's Oat Milk Latte has no allergen flag, so "at least one allergy flag each" is not met for it; the contract wins; (3) the mock-user/vendor-id mismatch is resolved by adding mock users `vendor-shop-001` and `vendor-indep-001` to the issuer (approved 2026-10-27; `MockUser.cs`, no authorization logic changed); (4) run manually, not auto-run by Compose.


**Renumbering note (2026-09-13)**: this item was `DEV-003` prior to 2026-09-13, shifted to `DEV-004` in the same renumbering that introduced `WI-DEV-001` (base .NET solution/project scaffold) and moved the real `docker-compose.yml` item from `DEV-001` to `DEV-002`. No content changed beyond the ID itself and the cross-references below.

**Context / Why**
`DEV-002` gets the environment running but empty. A demoable local e2e needs seeded reference data — vendors, listings with modifiers/allergy flags, preference profiles.

**Inputs / References**
- *Decisions*: none new
- *Interfaces*: `IRepository<T>`/`CosmosRepository<T>` (`DATA-002`) — seeds through the repository abstraction, not raw SDK calls
- *Environment/tooling*: `DEV-002`
- *Test/chaos methodology*: not applicable
- *Business context*: `data-model-api-contracts.md`, `glossary.md`

**You do not need to know about**
- Any service's business logic beyond the documented shapes

**Out of scope**
- Does not seed order/cart data as if orders were placed — better exercised live once ordering-service exists

**Requirements / Acceptance Criteria**
- Script (auto-run on `docker-compose up`, or documented manual command) writes: 2 vendors (one Shop, one Independent, both `Verified`), 5–10 listings across them with modifiers and at least one allergy flag each, 1–2 sample preference profiles
- Publishes a `VendorVerified` event onto the event backbone for each seeded vendor — the interim local-dev substitute for admin-service's real verification flow (not yet built), per the Open Point recorded in `WI-CAT-001.md`
- Idempotent — running it twice doesn't duplicate data
- Every field traces to a glossary term — no invented fields

**Dependencies**
- Blocked by: `DEV-002`, `DATA-002`
- Can be worked in parallel with: `DEV-003`

**AI-agent suitability**
Yes — fully derivable from existing schema docs.

**Environment(s) affected**: local dev only
**Resources provisioned/changed**: seed script + fixture data
**Secrets/config touched**: none

**Open Points (working)**
*(none currently)*
