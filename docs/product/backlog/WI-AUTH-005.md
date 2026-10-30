> **Status:** Done · evidence: `tools/BakeryMarketplace.MockOidcHost` and the `MockOidc*` tests in `tools/tests/BakeryMarketplace.Auth.Tests`

```
WI ID:               AUTH-005
Title:                Local mock OIDC issuer — token minting + PKCE authorization-code flow
Type:                 Service Implementation
Epic:                 EPIC-AUTH
Shared with epic(s):  EPIC-WEB-CUSTOMER (WEB-001 depends on this for the browser login flow)
Hat/Owner:            Platform Engineering
Status:               Done
Size:                 M (revised up from S — see Context/Why)
```

**Revision note (2026-09-13)**: this spec supersedes an earlier, narrower draft of the same item (token-minting only, no PKCE, Size S). This file was drafted before ADR-0011 (frontend framework) existed and had not yet been updated to match ADR-0006's own amendment note describing the PKCE requirement — reconciled now so the spec and the ADR agree.

**Context / Why**
`tech-stack.md`'s Auth row names a "local stub/mock OIDC issuer (config-driven issuer/JWKS URL swap)" as the local-dev equivalent of Entra External ID, per ADR-0006. This item builds that issuer. Its scope was revised after ADR-0011 (frontend framework) required a real browser redirect flow rather than only direct token minting — see ADR-0006's amendment note. Nothing had started building this item yet, so the expanded scope is folded directly into this spec rather than handled as a correction.

**Inputs / References**
- *Decisions*: `docs/architecture/adr/0006-auth-authz-model.md` (including its ADR-0011 amendment note), ADR-0010 (C#/.NET), ADR-0011 (PKCE flow requirement)
- *Interfaces*: none consumed — this issues tokens, it doesn't validate them (that's `AUTH-001`)
- *Environment/tooling*: `docs/architecture/tech-stack.md`'s local-dev Auth row
- *Test/chaos methodology*: deterministic tests only, same reasoning as `AUTH-001`/`AUTH-003` — no live chaos decorator, auth has no fallback behavior to prove
- *Business context*: none needed

**You do not need to know about**
- Real Microsoft Entra External ID tenant/policy configuration (`AUTH-004`, held per open item #21) — this issuer never talks to Entra, it's a local-only substitute
- Per-service resource-ownership rules (`AUTH-002`) — this item only issues tokens with configurable claims

**Out of scope**
- Does not implement refresh tokens or silent renewal — issued access tokens simply expire; a caller must re-run the login flow. See `docs/governance/open-items-register.md` item #24.
- Does not implement real user accounts/passwords — the `/authorize` login page picks from a small fixed set of mock users/roles, no credential storage
- Does not configure a real Entra External ID tenant (`AUTH-004`)

**Requirements / Acceptance Criteria**
- `/authorize` endpoint: minimal login page listing mock users (at least one per role — Customer, Vendor, Admin); redirects back to the client's `redirect_uri` with an authorization code, honoring PKCE's `code_challenge`/`code_challenge_method`
- `/token` endpoint: supports the `authorization_code` grant (validates the PKCE `code_verifier`) and continues to support direct claim-request minting for non-browser test scenarios (existing `AUTH-003`/`AUTH-001` test usage)
- `/.well-known/openid-configuration` and JWKS endpoint, so `AUTH-001`'s middleware can validate against this issuer identically to a real one (config-driven Authority swap, unchanged)
- Issued tokens carry the same claim shape as production (`sub`, `roles`, `vendorType` where applicable), configurable per mock user
- xUnit/integration tests: full PKCE flow issues a token `AUTH-001`'s middleware accepts; a request with a mismatched `code_verifier` is rejected; a request for a nonexistent mock user fails cleanly

**Dependencies**
- Blocks: `WI-WEB-001` (needs a working `/authorize`+`/token` pair to build the redirect flow against)
- Blocked by: none
- Can be worked in parallel with: `AUTH-002`, `AUTH-003`, `WI-DEV-001` (base .NET solution scaffold)

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: verify the full PKCE round-trip against `AUTH-001`'s actual middleware, not just against this issuer's own tests in isolation.

**AI-agent suitability**
Yes. Fully specified by ADR-0006/0011 plus the acceptance criteria above; the login page's UI is deliberately minimal (a pick-list, not a designed experience).

**Open Points (working)**
- [ ] No refresh-token support anywhere in this flow — promoted to `docs/governance/open-items-register.md` (item #24) rather than left here, since it's a real v1 limitation that outlives this item
