# Reconciliation Dispositions — 2026-10-25

**Status:** Official reconciliation record  
**Authority:** Bakery Marketplace repo agent  
**Source:** `docs/product/backlog/RECONCILIATION-2026-09-28.md` and repository verification  

This document records the verification results and final dispositions of findings raised in `RECONCILIATION-2026-09-28.md`. In accordance with repo governance, historical `WI-*.md` specification files are not edited directly.

---

## A. Status Drift Dispositions

| # | Item | Observed in Repo | Final Disposition |
|---|---|---|---|
| **A1** | `WI-DEV-001` | Solutions and 4 projects (`CatalogService`, `OrderingService`, `AdminService`, `NotificationService`) scaffolded under `/services/` and `/BakeryMarketplace.slnx`. Build and tests pass. `ACTIVITY-LOG.md` logs completion on 2026-09-15. | **Done**. Status drift acknowledged; implementation and solution structure verified. |
| **A2** | `WI-DATA-002`, `WI-CACHE-002`, `WI-EVT-003`, `WI-AUTH-002` | `CosmosRepository`, `RedisCacheProvider`, `RedisStreamsEventTransport`, and `ResourceOwnershipHandler` implemented with tests passing. | **Done**. Delivered in Batch 2 (2026-09-15). |
| **A3** | `WI-CACHE-004` | `EPIC-CACHING.md` lists as Done, WI file lists as Ready. | **Done**. Pre-existing chaos/fallback test harness is in place. |
| **A4** | `WI-VEN-001`, `WI-PREF-001` | Blocked-by list includes `DEV-001`. | **Unblocked**. Dependency on `DEV-001` is satisfied. |
| **A5** | `WI-CAT-001` / `WI-DEV-004` | Residual reference to old seed ID DEV-003. | **Noted**. Seed script was renumbered to `DEV-004`. |
| **A6** | `WI-AUTH-005` | Claim was that only `MockUser.cs` existed. Verification shows full OIDC endpoints (`/.well-known/openid-configuration`, `/jwks.json`, `/authorize`, `/token`) implemented in `MockOidcIssuer.cs` with 23/23 tests passing. Logged 2026-09-21 in `ACTIVITY-LOG.md`. | **Done & Verified**. Full PKCE flow verified against middleware. |
| **A7** | Batch 1 verification checkpoint | Open in `PARKING-LOT.md`; logged as reviewed in `ACTIVITY-LOG.md`. | **Verified**. All tools assemblies compile and pass contract tests. |
| **A8** | Integration adapter test suites | Tests fall back to in-memory/fake repositories when local Docker dependencies are not running. | **Accepted for local dev**. Flagged for CI enforcement once `DEV-002` (Compose infra) is active. |

---

## B. Code Findings Dispositions

| # | Finding | Verification Result | Disposition |
|---|---|---|---|
| **B1** | `RedisCacheProvider.GetAsync` swallows exceptions | Code in `tools/BakeryMarketplace.Caching/RedisCacheProvider.cs` was already updated on 2026-09-16. `StringGetAsync` is intentionally unwrapped so exceptions propagate to `ResilientCacheProvider` to trip the circuit breaker. | **Resolved**. No code changes needed. |
| **B2** | `RedisStreamsEventTransport` dead-letter & pending messages | `RedisStreamsEventTransport.cs` currently swallows deserialization exceptions without sending to dead-letter, and reads only `NewMessages` without `XAUTOCLAIM`. | **Open / Confirmed Gap**. Tracked for resolution prior to production release. |
| **B4** | Sealing inconsistent across adapters | Architectural cleanup. | **Low Priority Backlog**. Address during adapter refactoring passes. |
| **B5** | Mixed package versions (10.x vs 8.x on net8.0) | Package versions functional but mixed across some tooling projects. | **Low Priority Backlog**. Central Package Management (CPM) recommended. |

---

## C. Delegation Packets & Staged Files Disposition

1. `DELEGATION-PACKET-05`, `DELEGATION-PACKET-06`, `DELEGATION-PACKET-07`, and `WAVE-2-NOTES` in `_incoming/` are 100% byte-for-byte identical to existing files in `docs/product/backlog/delegation-packets/`. Existing repo files retained without changes.
2. `supersession-2026-09-28.md` mentions "minimum sufficient context" vs "targeted sufficient context". A full grep of the bakery repo revealed 0 occurrences of the deprecated phrasing; no supersession tags required.
3. Incoming worklog files placed at:
   - `docs/product/backlog/RECONCILIATION-2026-09-28.md`
   - `docs/product/backlog/worklog/README.md`
   - `docs/product/backlog/worklog/reconciliation/README.md`
   - `docs/product/backlog/worklog/worklog-bakery-extract-2026-09-28.md`
   - `docs/product/backlog/worklog/worklog-coordination-2026-09-28.md`
   - `docs/product/backlog/worklog/supersession-2026-09-28.md`
