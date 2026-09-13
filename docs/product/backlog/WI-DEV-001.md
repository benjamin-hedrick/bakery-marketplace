```
WI ID:               DEV-001
Title:                Real docker-compose.yml
Type:                 Infra/Environment
Epic:                 EPIC-LOCAL-DEV
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Ready (sequence after Layer-1 items land; can be drafted in parallel)
Size:                 M
```

**Context / Why**
`docker-compose.yml` is currently an empty stub. `tech-stack.md`'s local-dev table already specifies exactly what belongs here — this item builds that table into a working file.

**Inputs / References**
- *Decisions*: ADR-0002 (cache profile gating), ADR-0003 (eventing default service), ADR-0004 (data store default service), ADR-0006 (mock issuer)
- *Interfaces*: none directly — wires containers together, not application interfaces
- *Environment/tooling*: `tech-stack.md`'s local development stack table
- *Test/chaos methodology*: not applicable to the file itself; `DATA-003` runs integration tests against the environment this produces
- *Business context*: none

**You do not need to know about**
- Any domain service's business logic

**Out of scope**
- Does not build the actual application service containers (they don't exist as running services yet)
- Does not implement seed data (`DEV-003`) or Stripe CLI wiring (`DEV-002`)

**Requirements / Acceptance Criteria**
- Default `docker-compose up` brings up: Redis Streams (ADR-0003), Cosmos emulator (ADR-0004), the mock OIDC issuer (`AUTH-005`) — all non-optional
- `docker-compose --profile with-redis up` additionally brings up cache Redis (ADR-0002), still opt-in
- Every service's connection config (Cosmos endpoint/key, Redis connection strings, `Auth:Authority`) is wired via environment variables matching what each library expects
- A basic readiness check confirms all default services are reachable after `up` — enough to say "the environment is up," not elaborate health dashboards

**Dependencies**
- Blocked by (softly — can stub ahead): `CACHE-002`, `DATA-002`, `EVT-003`, `AUTH-005`
- Blocks: `DEV-003`, `DATA-003`

**AI-agent suitability**
Yes — `tech-stack.md` already specifies every service and toggle; this is assembly against a fully-specified table.

**Environment(s) affected**: local dev only
**Resources provisioned/changed**: Compose services listed above
**Secrets/config touched**: none real — local dev uses `.env` for Stripe test-mode keys only (ADR-0007)

**Open Points (working)**
*(none currently)*
