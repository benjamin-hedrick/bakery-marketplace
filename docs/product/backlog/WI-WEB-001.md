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
- Does not implement refresh-token/silent-renewal — token expiry means re-login; no background refresh exists. See the open-items-register entry.
- Does not extract a shared npm package across apps — this scaffold is duplicated (not centrally packaged) between `web-customer` and `web-queue-display` for now, per ADR-0011's stated reasoning
- Does not implement any specific page/route beyond a login redirect and an authenticated shell

**Requirements / Acceptance Criteria**
- Vite + React project scaffold, environment-driven per-service API base URLs (direct calls, no gateway, per ADR-0008)
- Full PKCE authorization-code redirect flow against `AUTH-005`'s revised endpoints; access token held in memory only (a React context/store), never `localStorage`/cookies
- No refresh-token handling — token expiry surfaces as a clean "please log in again" state, not a silent failure
- Reusable authenticated-fetch wrapper (attaches the bearer token to outgoing requests) that both `web-customer` and `web-queue-display` import as source, not a package
- CORS note: local backend services must accept requests from this app's local dev origin — flagged as an open point below, not solved here

**Dependencies**
- Blocks: `CUST-002`, `CUST-003`, `CUST-004`, `QUE-002`
- Blocked by: `AUTH-005` (revised)
- Can be worked in parallel with: none of the above (it's the blocking node); can proceed alongside any backend-only item

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. Fully specified by ADR-0011 plus the acceptance criteria above; no business judgment call remains.

**Open Points (working)**
- [ ] Local backend services (via `docker-compose`, `WI-DEV-001` once it exists — see `PARKING-LOT.md`) need CORS enabled for this app's local origin. `WI-DEV-001` itself isn't detailed yet (flagged in `worklog-2026-09-07.md`), so this can't cleanly attach to a real work item yet — tracked in the parking lot instead.
