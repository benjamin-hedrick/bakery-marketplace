```
WI ID:               VEN-002
Title:                Verification status workflow (Pending → Verified / Suspended)
Type:                 Service Implementation
Epic:                 EPIC-VENDOR-ONBOARDING
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 M
```

**Context / Why**
`VEN-001` creates a `VendorProfile` in `Pending` status but has no way to move it forward — ADR-0009/`data-model-api-contracts.md` name `VendorVerified`/`VendorSuspended` as events `catalog-service` already consumes (`CAT-001`) to gate whether a vendor's listings can be `Published`, but nothing publishes them yet. This is the real implementation that eventually replaces `DEV-004`'s seed-script workaround (see `WI-CAT-001.md`'s Open Points), which currently publishes `VendorVerified` directly onto the event backbone for seeded vendors as a stand-in for this not-yet-built workflow.

**Inputs / References**
- *Decisions*: ADR-0009 (hosted in `admin-service`), ADR-0003 (event envelope/delivery guarantees), ADR-0006 (Admin role, not self-service — granted out-of-band per that ADR)
- *Interfaces*: `VendorProfile` (`VEN-001`), `IEventPublisher` (`EVT-001`/`EVT-003`), payload records (`VendorVerifiedPayload`, `VendorSuspendedPayload` — already exist in `BakeryMarketplace.EventSchemas` per `TOOL-001`, no new payload needed)
- *Environment/tooling*: local Cosmos emulator, local event backbone (`DEV-002`)
- *Test/chaos methodology*: standard unit + integration tests, no adapter/chaos pattern
- *Business context*: `docs/architecture/ddd/glossary.md` (Vendor Verification Status), `docs/architecture/ddd/event-storming.md` Flow 1 (`VerifyVendor` command, `VendorVerified` event, and the policy that gates Catalog publishing)

**You do not need to know about**
- `CAT-001`'s specific mechanism for storing derived verification status (a `CacheProvider`-backed entry, per that item's own Open Point) — this item only needs to publish the events correctly; how a consumer caches them is that consumer's concern
- Stripe Connect onboarding (`VEN-003`) — verification status and payout eligibility are related but this item doesn't touch payments

**Out of scope**
- Does not implement `VEN-001`'s profile CRUD (already built, this item only adds status transitions on top of it)
- Does not implement the admin-facing moderation/verification queue UI (`ADM-001`) — this item is the backend workflow and events only
- Does not force-unpublish a suspended vendor's already-`Published` listings — per `WI-CAT-001.md`'s own stated choice (reject new publishes, don't force-unpublish), this item's `VendorSuspended` event is sufficient; any different downstream handling is `CAT-001`'s decision, not this item's

**Requirements / Acceptance Criteria**
- `GET /admin/vendors/pending` (Admin role) — lists `VendorProfile`s with `verificationStatus: "Pending"`, per `data-model-api-contracts.md`
- `POST /admin/vendors/{id}/verify` (Admin role) — transitions `verificationStatus` to `"Verified"` and publishes `VendorVerified` (existing payload shape, `TOOL-001`); rejects the transition with a clear error if `vendorType == "Independent"` and `complianceChecklist` is empty/unset (the one piece of the Independent-vendor compliance step this item can enforce structurally, without knowing the checklist's real business content — see `VEN-001`'s own Open Point)
- `POST /admin/vendors/{id}/suspend` (Admin role, requires a `reason`) — transitions `verificationStatus` to `"Suspended"` from either `"Pending"` or `"Verified"`, and publishes `VendorSuspended` with that reason
- An invalid transition (e.g., verifying an already-`Suspended` vendor without an intermediate reset) fails with a clear error, not a silent no-op
- Integration test proving: verify → `VendorVerified` published with correct `vendorId`; suspend → `VendorSuspended` published with the correct `reason`; a `CAT-001`-style consumer subscribed to both events sees the correct sequence

**Dependencies**
- Blocks: none directly, though it's what `CAT-001`'s real (non-seed-script) local-dev path and any future `EPIC-ADMIN` UI item depend on existing
- Blocked by: `VEN-001`, `EVT-003`
- Can be worked in parallel with: `PREF-002`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. Fully specified by the existing event names/payloads and `VEN-001`'s profile shape; the one judgment call (Independent-vendor compliance gating) is scoped narrowly enough (checklist non-empty, not its actual content) to not require further human input.

**Interfaces consumed**: `VendorProfile` (`VEN-001`), `IEventPublisher` (`EVT-001`/`EVT-003`)
**Events published/consumed**: publishes `VendorVerified`, `VendorSuspended` (existing payload records, `TOOL-001` — no schema change)
**Data touched**: `vendors` container (status field only — `VEN-001` owns the rest of the document)

**Open Points (working)**
- [ ] Once this item lands, `WI-CAT-001.md`'s and `WI-DEV-004.md`'s notes about the seed-script workaround for `VendorVerified` should be revisited — not urgent (the seed workaround remains a legitimate local-dev shortcut even after this exists, since local e2e testing shouldn't require running the full admin verification flow just to seed data), but worth a conscious decision rather than leaving two paths to the same event undocumented as coexisting on purpose.
