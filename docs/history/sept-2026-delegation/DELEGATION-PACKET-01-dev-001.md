# Delegation Packet 01 — Base .NET Solution Scaffold

> **Status:** Historical · moved 2026-10-30 from `docs/product/backlog/delegation-packets/`. September 2026 packets handed to AI agents, kept as a record of how work was delegated then; the October work was done in interactive slices instead. The text is unchanged; relative links in it no longer work.

**Item(s) covered**: `WI-DEV-001` (solo — foundational blocker, kept isolated for visibility rather than paired)
**Full spec**: `docs/product/backlog/WI-DEV-001.md` — this packet condenses it for handoff; if anything here conflicts with that file, the file wins (check `docs/ACTIVITY-LOG.md`'s most recent entry first — this repo has had real drift between a spec and its own referencing ADR before, see the 2026-09-13 entry).
**AI-agent suitability**: Yes, per the source WI, with one caveat below.
**Delegation wave**: independent of every other packet in this round — no coordination needed with Packets 02–04.

## Build this

One `.sln`/`.slnx` referencing four empty, buildable ASP.NET Core Web API projects (`CatalogService`, `OrderingService`, `AdminService`, `NotificationService`, net8.0) under their existing `/services/<name>/src` folders, each:
- Referencing only the `/tools/BakeryMarketplace.*` libraries it actually needs (don't wire a library a service has no documented use for — check `docs/architecture/data-model-api-contracts.md`'s per-service sections for what each one actually touches)
- Exposing `GET /health`
- Registering `UseCorrelationId()` (already built — `tools/BakeryMarketplace.Logging`)
- Registering a CORS policy for a configurable local frontend origin (not hardcoded) — this is the one concrete thing this packet exists to unblock for the frontend work already spec'd

## Scope boundaries (read before touching code)

- **Do not** implement any controller/endpoint logic beyond the health check. Empty, buildable projects only.
- **Do not** touch `docker-compose.yml`, Cosmos emulator, Redis Streams, or seed data — separate items, separate packets.
- **You do not need** any application/business logic context at all for this packet — it's pure project scaffolding.

## Where to look (pointers, not restated)

- `docs/architecture/adr/0010-service-language-framework.md` — the solution/project structure this codifies
- `tools/BakeryMarketplace.slnx` — existing convention for how the `/tools` libraries are already organized; mirror its shape
- `docs/architecture/data-model-api-contracts.md` — per-service sections tell you which tool libraries each service project needs referenced

## One open item to flag, not resolve

Batch 1 (six items, delivered and spec-reviewed 2026-09-12) built the shared `/tools` libraries before this scaffold existed. If anything in Batch 1's delivered code assumes a different project layout than what you build here, **stop and flag it — don't silently reconcile.** This hasn't been specifically checked yet (the 2026-09-12 review covered signatures/contract-tests, not solution structure).

## Definition of Done

Standard DoD (`docs/process/definition-of-done.md`) plus: confirm the flag above one way or the other before marking this complete.
