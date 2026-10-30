> **Status:** Ready

```
WI ID:               VEN-001
Title:                Vendor profile + application (VendorType: Shop | Independent)
Type:                 Service Implementation
Epic:                 EPIC-VENDOR-ONBOARDING
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 S
```

**Context / Why**
Vendor Onboarding & Verification has a documented container shape (`data-model-api-contracts.md`'s `vendors` container) and is central to the vision (principle 3: small/home-based vendors are first-class actors, distinguished by `VendorType`), but no work item has ever implemented it. This item is the profile/application half — creating a `VendorProfile` and letting a vendor manage their own basic info; `VEN-002` (the verification workflow itself: queue, verify, suspend) depends on this existing first.

**A small gap surfaced while detailing this item, resolved here rather than left implicit**: `data-model-api-contracts.md`'s `admin-service` API endpoint list has `GET /admin/vendors/pending`, `POST /admin/vendors/{id}/verify`, and `POST /admin/vendors/{id}/suspend` — but nothing for a vendor to actually *apply* in the first place (the `ApplyAsVendor` command named in `docs/architecture/ddd/event-storming.md`'s Flow 1 has no corresponding endpoint anywhere). Added here: `POST /admin/vendors` (Vendor role required, creates a `VendorProfile` in `Pending` status) and `GET /admin/vendors/{vendorId}`/`PUT /admin/vendors/{vendorId}` (Vendor role + resource-ownership check, for a vendor to view/edit their own profile). `data-model-api-contracts.md`'s `admin-service` section is updated accordingly as part of this item — see the updated copy of that file.

**Inputs / References**
- *Decisions*: ADR-0004 (`vendors` container, `vendorId` partition key, Session consistency), ADR-0009 (hosted in `admin-service`), ADR-0006 (Vendor role + resource-ownership check — a caller already needs the `Vendor` role claim before applying; role assignment itself is an auth-provider concern, not this item's)
- *Interfaces*: `IRepository<T>`/`CosmosRepository<T>` (`DATA-002`), `AUTH-002`'s ownership-check pattern
- *Environment/tooling*: local Cosmos emulator, `WI-DEV-001` (needs a real `AdminService` project to add code to)
- *Test/chaos methodology*: standard unit + integration tests, no adapter/chaos pattern
- *Business context*: `docs/architecture/ddd/glossary.md` (Independent Vendor's compliance-checklist distinction from Shop), `docs/architecture/ddd/event-storming.md` Flow 1 (`ApplyAsVendor` command this item implements)

**You do not need to know about**
- The verification workflow itself (queue, verify/suspend, `VendorVerified`/`VendorSuspended` events) — that's `VEN-002`, a separate item; this item only creates and stores the profile
- Stripe Connect onboarding (`VEN-003`) — this item stores no payment/KYC data, only the fields already in `data-model-api-contracts.md`'s `VendorProfile` shape

**Out of scope**
- Does not implement `POST /admin/vendors/{id}/verify` or `/suspend`, or publish `VendorVerified`/`VendorSuspended` (`VEN-002`)
- Does not implement the admin-facing moderation/verification queue UI (`ADM-001`, separate)
- Does not populate `complianceChecklist`'s actual checklist items/logic beyond storing whatever structure is submitted — the specific compliance requirements for Independent vendors are a business-rules question this item doesn't resolve (flagged as an Open Point)

**Requirements / Acceptance Criteria**
- `VendorProfile` document per `data-model-api-contracts.md`: `id, vendorId, name, vendorType ("Shop" | "Independent"), verificationStatus ("Pending" | "Verified" | "Suspended"), contactInfo, complianceChecklist: {}, createdAt, updatedAt`
- `POST /admin/vendors` (Vendor role) — creates a new `VendorProfile` with `verificationStatus: "Pending"`; a caller who already has a profile gets a clean conflict response, not a silent duplicate
- `GET /admin/vendors/{vendorId}` (Vendor role + resource-ownership check via `AUTH-002`'s pattern) — a vendor reads their own profile
- `PUT /admin/vendors/{vendorId}` (same role/ownership requirement) — updates `name`/`contactInfo`/`complianceChecklist`; **does not** allow the caller to set their own `verificationStatus` (that's `VEN-002`'s job, enforced server-side, not client-trusted)
- `vendorType` is set at application time (`POST`) and is immutable afterward — matches the glossary's framing of `VendorType` as a fixed distinction, not something that flips later

**Dependencies**
- Blocks: `VEN-002`, `VEN-003`
- Blocked by: `DATA-002`, `AUTH-002`, `DEV-001` (base .NET solution scaffold)
- Can be worked in parallel with: `PREF-001` (no shared code or data)

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: confirm `data-model-api-contracts.md`'s `admin-service` endpoint list was actually updated with the new `POST`/`GET`/`PUT /admin/vendors...` endpoints as part of this item, not left as a documented-here-only addition.

**AI-agent suitability**
Partial. The CRUD/model logic is fully agent-suitable. The specific contents of `complianceChecklist` for Independent vendors (see Open Points) is a real business-rules question this item can't resolve on its own.

**Interfaces consumed**: `IRepository<T>` (`DATA-002`)
**Events published/consumed**: none (this item raises no events — `VEN-002` publishes `VendorVerified`/`VendorSuspended`)
**Data touched**: `vendors` container

**Open Points (working)**
- [ ] What does `complianceChecklist` actually need to contain for an Independent vendor (per the glossary's "added compliance checklist step" note)? Not decided anywhere yet — this item stores whatever structure is submitted (an open `{}` object) without validating specific required fields; a real checklist schema is a business decision for a future item, not invented here.
