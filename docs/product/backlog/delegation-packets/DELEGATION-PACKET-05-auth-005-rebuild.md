# Delegation Packet 05 — Local Mock OIDC Issuer (Rebuild/Completion)

**Item(s) covered**: `WI-AUTH-005` (solo — kept isolated, same reasoning as Packet 04: it's the single blocker for the entire frontend track)
**Full spec**: `docs/product/backlog/WI-AUTH-005.md` — condensed here; that file wins on conflict.
**AI-agent suitability**: Yes, no open judgment calls.
**Delegation wave**: independent of every other packet in this round. Not blocked by anything; blocks `WI-DEV-002` (soft) and `WI-WEB-001` (hard) and therefore the entire `EPIC-WEB-CUSTOMER`/`EPIC-QUEUE-DISPLAY` frontend track.

## Why this packet exists despite Packet 04 already covering this item

`local-demo-execution-plan.md` (2026-09-16) found that only `tools/BakeryMarketplace.Auth/MockUser.cs` — a plain data record — actually exists in the repo for this item. No `/authorize` endpoint, no `/token` endpoint, no JWKS server, no PKCE handling has been written, despite the spec being marked Ready since 2026-09-13 and delegated via Packet 04. **Do not assume Packet 04 was completed. Treat this as the real build, starting from a data-model-only baseline.**

Before writing new code, check whether anything beyond `MockUser.cs` was added since the execution plan was written (`git log`/`git status` on `tools/BakeryMarketplace.Auth/`) — if partial work exists, build on it and note what was already there; don't duplicate or silently overwrite.

## Build this

A local, non-production OIDC issuer standing in for Entra External ID:
- `/authorize` — minimal login page, at least one mock user per role (Customer, Vendor, Admin — use the existing `MockUsers.All` set); redirects with an authorization code, honoring PKCE's `code_challenge`/`code_challenge_method`
- `/token` — supports the `authorization_code` grant (validates `code_verifier`); also continues supporting direct claim-request minting (needed by `AUTH-001`/`AUTH-003`'s existing tests — check those test files before changing anything they rely on)
- `/.well-known/openid-configuration` + JWKS endpoint — `AUTH-001`'s middleware (`tools/BakeryMarketplace.Auth/AuthServiceExtensions.cs`) must validate against this issuer exactly as it would a real one — config-driven Authority swap, no special-casing
- Issued tokens carry the same claim shape as production (`sub`, `roles`, `vendorType` where applicable)

Sign with a local, non-secret RSA key generated for dev use only — this is explicitly not a place a real credential of any kind belongs.

## Scope boundaries (read before touching code)

- **Do not** implement real user accounts/passwords — a fixed pick-list of mock users (`MockUsers.All`), no credential storage
- **Do not** implement refresh tokens or silent renewal — out of scope here and tracked separately (`docs/governance/open-items-register.md` #24)
- **Do not** configure anything against a real Entra External ID tenant (`AUTH-004` — held, separate item, unrelated decision)
- **You do not need** Entra's actual tenant/policy configuration, or any per-service resource-ownership logic (`AUTH-002`, already built) — this item only issues tokens

## Where to look (pointers, not restated)

- `docs/architecture/adr/0006-auth-authz-model.md` — including its ADR-0011 amendment note, the direct source of the PKCE requirement
- `docs/architecture/adr/0011-frontend-framework.md` — why a real browser redirect flow is required at all
- `tools/BakeryMarketplace.Auth/AuthServiceExtensions.cs` — the middleware this issuer must validate against (config-driven, don't special-case)
- `tools/BakeryMarketplace.Auth/MockUser.cs` — the existing (only) piece of this item, reuse it

## Verify against, don't just build against

xUnit/integration test proving the full PKCE round-trip is accepted by `AUTH-001`'s actual middleware — not just this issuer's own tests in isolation. A mismatched `code_verifier` must be rejected; a request for a nonexistent mock user must fail cleanly.

## Definition of Done

Standard DoD (`docs/process/definition-of-done.md`) plus the middleware round-trip check above, plus: update `docs/ACTIVITY-LOG.md` noting this was a rebuild from a data-record-only baseline, not a fresh Packet-04 completion, so the discrepancy is traceable.
