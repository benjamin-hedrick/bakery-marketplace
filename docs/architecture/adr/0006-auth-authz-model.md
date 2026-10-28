# ADR-0006: Authentication & Authorization Model

**Status:** Accepted

## Context

Four actor types (Customer, Shop, Independent Vendor, Admin) need distinct capabilities, and several of those capabilities are resource-scoped, not just role-scoped — a Vendor manages *their own* listings and orders, not any vendor's. `tech-stack.md` already named Azure AD B2C as the candidate identity provider; this ADR settles the role model, token handling, and how authorization is actually enforced.

Two things make this ADR different from ADR-0002/0003/0004: there's no meaningful "local fallback" for a real cloud identity provider without creating a security hole, and authentication (identity) needs to stay cleanly separate from vendor verification (a domain/business rule already modeled in ADR-0004's Vendor Onboarding context), so the two aren't accidentally conflated.

## Decision

**Identity provider: Azure AD B2C**, OIDC/OAuth2. JWT access tokens carry:
- `sub` — the user's stable identifier
- `roles` — an array (`["Customer"]`, `["Vendor"]`, `["Vendor", "Customer"]`, `["Admin"]`) — an array because one person can plausibly hold more than one role
- `vendorType` (Vendor only) — `Shop` | `Independent`. This is a **data attribute for UX/business rules, not a separate authz role** — both vendor types get the same `Vendor` role and the same permission set.

**Client types:**
- `web-customer` and `web-admin` are **public clients**, using Authorization Code + PKCE — no client secret, standard for SPAs
- Backend services (`catalog-service`, `ordering-service`, etc.) never run their own login flow — they only **validate** incoming JWTs against Azure AD B2C's JWKS endpoint (issuer + audience + public keys), via a shared validation middleware in `/tools/auth-middleware` so every service does this the same way rather than reimplementing it

**Token storage — explicitly header-only, no cookies.** The access token is sent via the `Authorization` header on every request, never stored in or read from a cookie. This is stated explicitly (not left implicit) because it has a direct security consequence: classic CSRF specifically exploits a browser's automatic cookie attachment, so a header-only bearer token is not vulnerable to it by construction, in the same way a cookie-based session would be. **If any future work item introduces cookie-based token storage (e.g., for a refresh-token strategy), that changes this analysis and CSRF-specific mitigation (e.g., double-submit tokens, `SameSite` attributes) would need to be added at that point — this ADR does not cover that case because it doesn't apply under the current, header-only design.**

**Authorization is two layers, deliberately not one:**
1. **Coarse role check** — does the `roles` claim include what this endpoint requires (e.g., `Vendor` for "create a listing")?
2. **Resource-level ownership check**, enforced in application code, not claims — does the resource's `ownerId` match the token's `sub`? (e.g., "is this Listing's `vendorId` the same as the caller's `sub`?") This is what actually prevents one Vendor from editing another's listings; the role claim alone can't express it.

No centralized policy engine (e.g., OPA) — ownership checks are simple enough per-context that a shared policy service would be more infrastructure than the problem currently justifies. Named as a deferred v2 option, not silently skipped.

**Authentication vs. verification — explicitly not the same gate.** A logged-in Vendor (role check passes) can manage draft listings before their Vendor Onboarding verification status (ADR-0004, `vendors` container) reaches `Verified` — but can't publish a listing live until it does. That's a domain business rule enforced by the Vendor Onboarding/Catalog contexts, not an authorization rule, and it deliberately doesn't live in this auth layer.

**Admin role is not self-service** — granted out-of-band (e.g., manual assignment), not available through normal signup.

**Local development**: a lightweight mock OIDC/JWT issuer (e.g., a small local stub server) issues signed tokens with configurable claims, and local service config points the same shared `/tools/auth-middleware` at the mock issuer's JWKS URL instead of Azure AD B2C's real one. **This is a config swap (different issuer), not a runtime fallback** — unlike caching/eventing/data access, there's no scenario where a production service should ever silently fall back to a mock issuer, so this deliberately sits outside the adapter+circuit-breaker pattern from ADR-0002/0003/0004, the same way ADR-0005 (payments) did.

**Testing**: deterministic unit/integration tests for expired tokens, tampered signatures, missing/malformed claims, and clock skew — verifying the shared middleware rejects correctly in each case. Not a live chaos decorator, because there's no fallback behavior to prove under fault the way there is for cache/event resilience; auth failure should always mean a clean 401, not degraded-but-available service.

## Consequences

**Positive**
- Shared `/tools/auth-middleware` means every service validates tokens identically — no risk of one service having subtly weaker validation than another
- Two-layer authorization (role + ownership) is enough to express every actual permission need in this domain without needing a policy-engine investment
- Clean separation of authentication, authorization, and vendor verification means each can be reasoned about and tested independently

**Negative / accepted limitations**
- Resource-ownership checks are implemented per-service rather than centrally, so there's some duplicated logic across services (e.g., ordering-service and catalog-service both implement an "is this mine" check) — acceptable at this scale, would be worth extracting into a shared library or policy service if the number of resource types grows significantly
- No policy engine means authorization logic isn't independently auditable/queryable the way OPA-style declarative policies would be — accepted tradeoff, named as a deferred option rather than hidden
- The mock local issuer's token-issuing behavior won't perfectly mirror every Azure AD B2C edge case (custom policies, MFA flows) — acceptable since local dev's job is to exercise the validation middleware, not to reproduce B2C's own behavior

## Alternatives considered

1. **Full RBAC with a fine-grained permissions matrix.** Rejected — overkill for four actor types where most authorization questions are really "is this yours," not "does this role have this permission." Would add configuration surface without solving anything the two-layer model doesn't already solve.
2. **Separate authz roles for Shop vs. Independent Vendor.** Rejected — they have identical permissions; a data attribute (`vendorType`) captures the real distinction without role proliferation.
3. **A centralized policy engine (OPA or similar) from the start.** Rejected for v1 — real infrastructure and operational cost for a problem currently solvable with straightforward per-service ownership checks. Named explicitly as the natural v2 path if resource types or role complexity grow.
4. **Runtime fallback to a local/mock auth provider if Azure AD B2C is unreachable**, mirroring the cache/event pattern. Rejected — this would be a security hole, not resilience; auth failure should fail closed, not fall back to a weaker provider.

## Related

- `tech-stack.md` — resolves the last "Pending ADR" row
- ADR-0004 — Vendor verification status lives in the Vendor Onboarding context, deliberately separate from this ADR's role/authz model
- ADR-0002 / ADR-0003 / ADR-0004 — the adapter+fallback pattern this ADR deliberately does not use, for stated security reasons
- ADR-0005 — the other ADR that explicitly sits outside the adapter+chaos pattern, for its own stated reasons

## Amendment note (ADR-0008)

ADR-0008 (API Gateway) adds Azure API Management in front of these services. This does **not** change the decision above — every service still independently and fully validates the JWT and performs its own resource-ownership check, per zero-trust principles. APIM's JWT check is an additional, edge-level fast-fail optimization, not a replacement for anything in this ADR.

## Amendment note (Azure AD B2C → Microsoft Entra External ID)

Azure AD B2C stopped accepting new tenants as of May 2025, and Premium P2/Identity Protection retired March 2026 — the platform continues to be supported for existing tenants until at least May 2030, but is frozen (no new features). Microsoft's stated successor for new work is **Microsoft Entra External ID** (generally available since 2024). Since this project is new work, it targets Entra External ID instead of Azure AD B2C.

**This does not change anything else in this ADR.** The actual validation mechanism — JWT bearer tokens, issuer/audience/JWKS-driven verification, role + resource-ownership authorization — is identical regardless of which OIDC-compliant provider issues the token. Per ADR-0010, `Microsoft.AspNetCore.Authentication.JwtBearer` is Authority-URL-driven and config-only, meaning this swap is a configuration change (which Authority URL, which audience) rather than a code or design change.

**Only `AUTH-004`** (the actual tenant/policy configuration work, not yet built) needs to target Entra External ID specifically when it's picked up. `AUTH-001` (the generic JWT validation middleware) is unaffected and safe to build now regardless of this pending swap — see `docs/governance/open-items-register.md` item #21.

## Open item surfaced, not resolved here

**Secrets management (e.g., Azure Key Vault)** has not been formally decided anywhere in the plan — relevant to Stripe API keys, database connection strings, and any future service secrets, though not to this ADR directly (JWT validation needs only the public JWKS endpoint, no shared secret). Worth its own short ADR or a `tech-stack.md` addition before the build phase.

## Amendment note (ADR-0011 — local mock issuer's scope)

ADR-0011 (frontend framework) requires a real browser redirect flow (Authorization Code + PKCE) for local development, not just direct claim-request token minting. This means the local mock OIDC issuer (`AUTH-005`) needs an actual `/authorize` endpoint (a minimal login page — pick a mock user/role) and a `/token` endpoint supporting the `authorization_code` grant with PKCE, in addition to whatever direct minting capability it already had.

**This does not change this ADR's design.** The validation side (shared middleware, Authority/Audience config-driven per ADR-0010) is unaffected — only the mock issuer's own surface area grows. Nothing has started building `AUTH-005` yet, so this is folded directly into its work-item spec (revised, Size S→M) rather than treated as a correction to already-built code.

## Amendment note (ADR-0018 — service callers)

Service-to-service calls use the OAuth2 client credentials grant (ADR-0018). The shared middleware validates the resulting app-only token like any other; the new `ServiceStockReserve` policy needs the `Stock.Reserve` app role **and** an app-only token (`idtyp=app` plus a client id), so a user token never passes it and a service token never passes the user policies. `Auth:Audiences` lets a service accept more than one audience. The local mock issuer gained real client authentication, and its earlier unauthenticated `client_credentials` shortcut that returned user tokens (including Admin) was removed (2026-10-28, `WI-AUTH-006` phase 1). The decision above is otherwise unchanged.

