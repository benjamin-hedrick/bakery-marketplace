```
WI ID:               AUTH-005
Title:                Local mock OIDC/JWT issuer for dev
Type:                 Service Implementation
Epic:                 EPIC-AUTH
Shared with epic(s):  EPIC-LOCAL-DEV (DEV-001 wires this into Compose)
Hat/Owner:            Platform Engineering
Status:               Ready
Size:                 S
```

**Context / Why**
ADR-0006 and `tech-stack.md` both describe a local mock OIDC/JWT issuer as local dev's stand-in for Entra External ID — "issues signed tokens with configurable claims... a config swap, not a runtime fallback." No work item ever built it; `AUTH-001` references it as an environment dependency but assumes it exists. This gap was surfaced on 2026-09-12 while scoping what "run locally end-to-end" actually requires — the same shape of gap this project's process already treats as a trigger to fix explicitly, not patch quietly.

**Inputs / References**
- *Decisions*: ADR-0006 (the mock-issuer design and its "config swap" framing), ADR-0010 (C#/.NET)
- *Interfaces*: none consumed — `AUTH-001`'s middleware is config-driven against whatever `Authority`/`Audience` it's pointed at; this item just needs a real JWKS + token endpoint
- *Environment/tooling*: runs as a Compose service (wired in `DEV-001`), reachable at a fixed local URL every service's `Auth:Authority` points to
- *Test/chaos methodology*: none beyond a smoke test proving issued tokens validate against `AUTH-001`'s middleware
- *Business context*: none

**You do not need to know about**
- Entra External ID's actual tenant/policy configuration (`AUTH-004`, separate, held)

**Out of scope**
- Does not configure a real Entra External ID tenant (`AUTH-004`)
- Does not implement a full OIDC authorization-code flow (no login UI/consent screen) — this is a token-minting test double, not a real IdP
- Does not implement refresh tokens

**Requirements / Acceptance Criteria**
- Minimal ASP.NET Core service exposing a JWKS endpoint (`/.well-known/jwks.json`) and a token-issuing endpoint that accepts requested `sub`/`roles`/`vendorType` claims and returns a signed JWT
- Signs with a local, non-secret RSA key generated for dev use only — never a real secret per ADR-0007's scope
- Documented way to mint a token for a given role/user without a real login flow (simple HTTP POST with desired claims)
- Smoke-tested against `AUTH-001`'s actual middleware, pointed at this issuer's JWKS URL

**Dependencies**
- Blocks: any local end-to-end run needing a real token (effectively everything downstream)
- Blocked by: none
- Can be worked in parallel with: `DATA-002`, `CACHE-002`, `EVT-003`, `AUTH-002`

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: confirm nothing here references or requires any real Entra credential.

**AI-agent suitability**
Yes — fully specified by ADR-0006's own description; no open judgment calls.

**Interfaces consumed**: none
**Events published/consumed**: none
**Data touched**: none

**Open Points (working)**
*(none currently)*
