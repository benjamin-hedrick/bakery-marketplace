# Delegation Packet 04 — Local Mock OIDC Issuer (PKCE)

**Item(s) covered**: `WI-AUTH-005` (solo — kept isolated because of its revision history and because it's the single item unblocking the entire frontend track)
**Full spec**: `docs/product/backlog/WI-AUTH-005.md` — condensed here; that file wins on conflict.
**AI-agent suitability**: Yes, no open judgment calls.
**Delegation wave**: independent of every other packet in this round. Not blocked by anything; blocks `WI-WEB-001` and therefore the entire `EPIC-WEB-CUSTOMER`/`EPIC-QUEUE-DISPLAY` frontend track — treat as higher-priority-to-finish than its "no dependencies" status alone would suggest.

## Revision note — read this before starting

This item was originally scoped as token-minting only (no browser flow). It was revised (Size S→M) after the frontend framework decision required a real PKCE authorization-code redirect flow. **The version of this file that matters is whatever's currently in the repo at `docs/product/backlog/WI-AUTH-005.md`** — this project has previously had a stale copy of this exact item sitting inconsistent with its own referencing ADR, so don't assume any cached/prior version of this spec (including one from an earlier point in this same delegation round) is current. If in doubt, check `docs/ACTIVITY-LOG.md`'s most recent entries for this item's name.

## Build this

A local, non-production OIDC issuer standing in for Entra External ID:
- `/authorize` — minimal login page, at least one mock user per role (Customer, Vendor, Admin); redirects with an authorization code, honoring PKCE's `code_challenge`/`code_challenge_method`
- `/token` — supports the `authorization_code` grant (validates `code_verifier`); also continues supporting direct claim-request minting (needed by `AUTH-001`/`AUTH-003`'s existing tests)
- `/.well-known/openid-configuration` + JWKS endpoint — `AUTH-001`'s middleware must validate against this issuer exactly as it would a real one (config-driven Authority swap, no special-casing)
- Issued tokens carry the same claim shape as production (`sub`, `roles`, `vendorType` where applicable)

Sign with a local, non-secret RSA key generated for dev use only — this is explicitly not a place a real credential of any kind belongs.

## Scope boundaries (read before touching code)

- **Do not** implement real user accounts/passwords — a fixed pick-list of mock users, no credential storage
- **Do not** implement refresh tokens or silent renewal — out of scope here and tracked separately (`docs/governance/open-items-register.md` #24)
- **Do not** configure anything against a real Entra External ID tenant (`AUTH-004` — held, separate item, unrelated decision)
- **You do not need** Entra's actual tenant/policy configuration, or any per-service resource-ownership logic (`AUTH-002`) — this item only issues tokens

## Where to look (pointers, not restated)

- `docs/architecture/adr/0006-auth-authz-model.md` — including its ADR-0011 amendment note, the direct source of the PKCE requirement
- `docs/architecture/adr/0011-frontend-framework.md` — why a real browser redirect flow is required at all
- `tools/BakeryMarketplace.Auth/AuthServiceExtensions.cs` — the middleware this issuer must validate against (config-driven, don't special-case)

## Verify against, don't just build against

xUnit/integration test proving the full PKCE round-trip is accepted by `AUTH-001`'s actual middleware — not just this issuer's own tests in isolation. A mismatched `code_verifier` must be rejected; a request for a nonexistent mock user must fail cleanly.

## Definition of Done

Standard DoD (`docs/process/definition-of-done.md`) plus the middleware round-trip check above.
