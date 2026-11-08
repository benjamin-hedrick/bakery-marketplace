> **Status:** Done · evidence: merged `c945b18`; verified under Docker, `docs/operations/local-dev.md`

> **Update 2026-11-08 (documentation pass):** the Compose `apps` profile now also runs the catalog, ordering and notification services, the BFF and the customer web app as containers; the queue display runs on the host (`docs/operations/local-dev.md`).

```
WI ID:               DEV-002
Title:                Real docker-compose.yml
Type:                 Infra/Environment
Epic:                 EPIC-LOCAL-DEV
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Done
Size:                 M
```

> **Reconciliation note (2026-10-26) — ADJUSTED.** Scope grows: once they exist, the Compose file also runs the Next.js app(s) and the GraphQL BFF (ADR-0012/0013) and a local OpenTelemetry trace viewer (ADR-0016, chosen in `WI-PORT-005`). The APIM reverse-proxy stand-in (`GW-005`) is obsolete and is **not** to be added (ADR-0008 amendment). See `reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`.


**Renumbering note (2026-09-13)**: this item was `DEV-001` prior to 2026-09-13. It was renumbered to `DEV-002` when `WI-DEV-001` (base .NET solution/project scaffold, closing `worklog-2026-09-07.md`'s gap #1) was added and took the `DEV-001` slot instead, since that scaffold is the more foundational prerequisite. No other content in this file changed beyond the ID itself and the two cross-references noted below.

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
- Does not implement seed data (`DEV-004`) or Stripe CLI wiring (`DEV-003`)

**Requirements / Acceptance Criteria**
- Default `docker-compose up` brings up: Redis Streams (ADR-0003), Cosmos emulator (ADR-0004), the mock OIDC issuer (`AUTH-005`) — all non-optional
- `docker-compose --profile with-redis up` additionally brings up cache Redis (ADR-0002), still opt-in
- Every service's connection config (Cosmos endpoint/key, Redis connection strings, `Auth:Authority`) is wired via environment variables matching what each library expects
- A basic readiness check confirms all default services are reachable after `up` — enough to say "the environment is up," not elaborate health dashboards

**Dependencies**
- Blocked by (softly — can stub ahead): `CACHE-002`, `DATA-002`, `EVT-003`, `AUTH-005`, `DEV-001` (the .NET solution scaffold — each service's `docker-compose` entry needs a real project to build/run)
- Blocks: `DEV-004`, `DATA-003`

**AI-agent suitability**
Yes — `tech-stack.md` already specifies every service and toggle; this is assembly against a fully-specified table.

**Environment(s) affected**: local dev only
**Resources provisioned/changed**: Compose services listed above
**Secrets/config touched**: none real — local dev uses `.env` for Stripe test-mode keys only (ADR-0007)

**Open Points (working)**
*(none currently)*
