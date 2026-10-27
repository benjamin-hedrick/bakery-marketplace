# Local Demo Execution Plan — M1 through M4

Status as of 2026-09-16. All work items listed below are fully defined (Ready,
complete spec) — nothing here is blocked on planning or detail work. What's
left is building and verification. Checkboxes track *built and verified
locally*, not *spec'd*.

Confirmed working today: `dotnet build` and `dotnet test` succeed against the
existing solution and `/tools` libraries.

---

## M1 — Environment Up

Gate for everything else. Nothing below M1 can be verified until this milestone
is real, not just spec'd.

- [x] **`WI-AUTH-005`** — Local mock OIDC issuer (PKCE). Completed via Delegation Packet 05 (rebuilt from data record, full PKCE endpoints & JWKS server verified against `AddBakeryAuth` middleware). Unblocks `DEV-002` and `WEB-001`.
- [ ] **`WI-DEV-002`** — Real `docker-compose.yml` (Redis Streams, Cosmos
      emulator, mock OIDC issuer as default services; cache Redis profile-gated).
      Soft-blocked by `AUTH-005` above.
- [ ] **`WI-DEV-004`** — Seed/fixture data script (2 vendors, 5–10 listings,
      preference profiles; publishes `VendorVerified` for seeded vendors as the
      interim stand-in for the not-yet-built verification workflow). Blocked by
      `DEV-002`, `DATA-002` (done).

**M1 exit test**: `docker-compose up` succeeds; all four services' `/health`
respond; mock issuer's `/.well-known/openid-configuration` and JWKS resolve.

---

## M2 — Backend Walking Skeleton

All items below are Ready. Suggested build order reflects real dependencies,
not epic grouping.

**Ordering critical path**
- [x] `WI-ORD-004` — FulfillmentStrategy seam (ACL boundary) — done (unblocks `ORD-002` and `ORD-003`)
- [ ] `WI-CAT-001` — Listing CRUD + modifier/allergy model (blocked by DATA-002, EVT-003, AUTH-002 — all done — and DEV-001, done)
- [ ] `WI-ORD-002` — Order aggregate + lifecycle states (blocked by ORD-004)
- [ ] `WI-ORD-003` — PickupFulfillment strategy (blocked by ORD-004, parallel with ORD-002)
- [ ] `WI-ORD-006` — Order persistence via Repository<T> (blocked by ORD-002, DATA-002)
- [ ] `WI-ORD-005` — Publish Order events via event backbone (blocked by ORD-002, EVT-003)
- [ ] `WI-CAT-003` — Cache-aside integration for listing reads (blocked by CAT-001, CACHE-002 — done)
- [ ] `WI-ORD-001` — Cart + checkout, payment stubbed (blocked by CAT-001, ORD-002, ORD-006)
- [ ] `WI-QUE-001` — Order-status read-model, event-fed CQRS (blocked by ORD-005, EVT-003, DATA-002)

**Preferences & Vendor Onboarding (independent track, parallel with above)**
- [ ] `WI-PREF-001` — Preference Profile CRUD (blocked by DATA-002, AUTH-002, DEV-001)
- [ ] `WI-PREF-002` — Publish Preference Snapshot (blocked by PREF-001, EVT-003)
- [ ] `WI-VEN-001` — Vendor profile + application (blocked by DATA-002, AUTH-002, DEV-001)
- [ ] `WI-VEN-002` — Verification status workflow (blocked by VEN-001, EVT-003)

**M2 exit test**: full API surface provable via integration tests / direct API
calls — browse, cart, checkout (stubbed payment), order lifecycle, preferences,
vendor onboarding. No browser UI involved yet.

---

## M3 — Browser-Visible Demo

> **2026-10-26:** `WI-WEB-001` below is superseded by `WI-PORT-001` (Next.js + Relay SSR proof) and `WI-PORT-002` (walking skeleton through the GraphQL BFF), per ADR-0012/0013. The `CUST-*` and `QUE-002` items are adjusted to block on those instead. The exit test is unchanged. Re-sequencing this plan is tracked in `WI-PORT-006` pass 2.

- [ ] **`WI-WEB-001`** — Shared React/Vite scaffold + PKCE auth pattern.
      **Single blocking node** for this entire milestone. Blocked by `AUTH-005`
      (its real server, not just the spec).
- [ ] `WI-CUST-002` — Listing browse/detail view (blocked by WEB-001)
- [ ] `WI-CUST-003` — Cart/checkout UI, unmissable test-mode banner (blocked by WEB-001, CUST-002)
- [ ] `WI-CUST-004` — Order confirmation + history/status view (blocked by WEB-001, CUST-003)
- [ ] `WI-QUE-002` — Live queue display UI, polling-based (blocked by WEB-001, QUE-001; parallel with CUST-* track)

**M3 exit test**: open a browser, log in via PKCE against the mock issuer,
browse seeded listings, add to cart, check out (visibly stubbed payment), see
confirmation and order history, watch the vendor queue display update. This is
the local demo finish line.

---

## M4 — Dietary-Safety Personalization (post-demo enhancement)

Not required to hit the local-demo finish line above, but fully defined and
ready to sequence immediately after M3.

- [ ] `WI-SRCH-001` — Personalized listing search, flags conflicts by default,
      `hideConflicts` opt-in (blocked by PREF-002, CAT-001)
- [ ] `WI-CUST-005` — Preferences/dietary-profile UI page (blocked by WEB-001, PREF-001 — no dependency on SRCH-001)
- [ ] `WI-CUST-006` — Personalized allergen highlighting + hide-conflicts toggle
      on the existing browse view (blocked by SRCH-001, CUST-002)

---

## Notes on trust in "done" items

A few items marked Done upstream deserve a asterisk before you build on them
blindly:

- `RedisCacheProviderTests`, `CosmosRepositoryTests`, and
  `RedisStreamsEventTransportTests` all silently fall back to an in-memory fake
  if they can't reach real Redis/Cosmos. Passing tests today does not confirm
  these adapters have ever run against real infrastructure — only once `DEV-002`
  is up will that get a real check.
- The 2026-09-12 session flagged that its own environment couldn't reach
  `nuget.org`, so Batch 1–4 code was reviewed against spec but not
  independently rebuilt/retested outside the delivering agents' own runs. Your
  successful `dotnet build`/`dotnet test` today is the first real confirmation
  outside that constraint — worth repeating after `DEV-002` lands, this time
  with real Redis/Cosmos containers in the loop.
