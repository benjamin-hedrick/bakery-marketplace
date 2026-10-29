```
WI ID:               WEB-001
Title:                Shared frontend scaffold + PKCE auth pattern (React/Vite)
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  EPIC-QUEUE-DISPLAY (QUE-002 builds on this same scaffold/auth pattern)
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 M
```

> **Update (2026-10-28):** the PKCE, in-memory-token and no-refresh-token requirements carried forward from this item were delivered for the Next.js app by `S1-02` (see `apps/web-customer/README.md`, "Login"), as a Next.js page flow rather than the Vite scaffold described below.

> **Reconciliation note (2026-10-26) — SUPERSEDED.** Superseded by `WI-PORT-001` (Next.js + Relay SSR proof) and `WI-PORT-002` (walking skeleton, the first real frontend scaffold), per ADR-0012, which supersedes ADR-0011. The Vite scaffold and direct-to-service base URLs no longer apply. **Carried forward**: Authorization Code + PKCE against `AUTH-005`, the in-memory-only access token, no refresh-token handling (open item #24), and an authenticated-fetch wrapper. Requests now go to the GraphQL BFF (ADR-0013) rather than to services. The spec below is kept unchanged as the historical record. See `worklog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`.


**Context / Why**
ADR-0011 picked React (Vite) as the frontend framework; this item is the actual scaffold every customer-facing and queue-display page builds on, including the PKCE login flow against the (revised) mock OIDC issuer. Deliberately not split per-app — `web-customer` and `web-queue-display` need the identical pattern, and building it twice before a third real instance existed would violate the "don't extract the abstraction before a second real use" discipline in reverse (here, building near-duplicate code instead of a premature abstraction).

**Inputs / References**
- *Decisions*: `docs/architecture/adr/0011-frontend-framework.md` (framework choice, token-storage rule), ADR-0006 (header-only bearer token, no cookies), ADR-0008 (frontend calls services directly, no gateway locally)
- *Interfaces*: `AUTH-005`'s revised `/authorize`+`/token` endpoints (must exist first)
- *Environment/tooling*: `docs/architecture/tech-stack.md`'s local-dev table — this item's dev-server needs to reach backend services' local origins directly
- *Test/chaos methodology*: not applicable — frontend scaffold, no chaos-relevant fault modes
- *Business context*: none needed

**You do not need to know about**
- Any specific domain page's content (catalog browsing, cart, etc.) — those are separate items building on top of this scaffold
- `web-admin` — explicitly out of scope until its backend epics exist

**Out of scope**
- Does not implement refresh-token/silent-renewal — token expiry means re-login; no background refresh exists. See `docs/governance/open-items-register.md` item #24.
- Does not extract a shared npm package across apps — this scaffold is duplicated (not centrally packaged) between `web-customer` and `web-queue-display` for now, per ADR-0011's stated reasoning
- Does not implement any specific page/route beyond a login redirect and an authenticated shell

**Requirements / Acceptance Criteria**
- Vite + React project scaffold, environment-driven per-service API base URLs (direct calls, no gateway, per ADR-0008)
- Full PKCE authorization-code redirect flow against `AUTH-005`'s revised endpoints; access token held in memory only (a React context/store), never `localStorage`/cookies
- No refresh-token handling — token expiry surfaces as a clean "please log in again" state, not a silent failure
- Reusable authenticated-fetch wrapper (attaches the bearer token to outgoing requests) that both `web-customer` and `web-queue-display` import as source, not a package

**Dependencies**
- Blocks: `CUST-002`, `CUST-003`, `CUST-004`, `QUE-002`
- Blocked by: `AUTH-005` (revised)
- Can be worked in parallel with: none of the above (it's the blocking node); can proceed alongside any backend-only item

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. Fully specified by ADR-0011 plus the acceptance criteria above; no business judgment call remains.

**Open Points (working)**
*(none currently — the CORS dependency previously tracked here is resolved: `WI-DEV-001` (base .NET solution scaffold, added 2026-09-13) carries a concrete acceptance criterion requiring each service to register a CORS policy for this app's local dev origin. Removed from `PARKING-LOT.md` accordingly.)*
