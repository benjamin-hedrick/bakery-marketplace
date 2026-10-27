# Owners and Working Defaults

> **Adopted 2026-10-26** as the "sensible defaults" for the open items in `06-open-items-before-delegation.md`. Any default here can be changed by the human lead; record the change as a dated note below the table.

## Owners (plan 07 requires one accountable owner per shared area)

This is a solo-led project, so the human lead is the accountable integrator for every shared area. Agents are contributors, never owners: they submit patches, dependency requests and handoff notes, and the lead (or a reviewer the lead names) merges.

| Area | Accountable integrator | Contributors | Merge rule |
|---|---|---|---|
| ADR adoption, reconciliation, central docs and indexes | Human lead | Agents propose edits | One docs-touching branch at a time for `MASTER-BACKLOG-OUTLINE.md`, `tech-stack.md`, ADR index and `ACTIVITY-LOG.md` |
| GraphQL schema + Relay compiler/codegen config | Human lead | BFF and frontend agents | Schema change = regenerate artifacts + run contract tests in the same PR |
| Root `package.json` / lockfile | Human lead | Feature agents (as requests) | One dependency change at a time; clean install + build after each |
| C# shared contracts (`tools/BakeryMarketplace.EventSchemas`, REST DTOs) | Human lead | Catalog/ordering agents work in separate service directories | Shared-type change needs explicit review and cross-service tests |
| Azure Pipelines YAML and required checks | Human lead | Agents provide commands/checks | No concurrent pipeline edits |
| Telemetry naming/propagation conventions | Human lead | Service agents instrument their own service | Conventions reviewed once (ADR-0016) |

## Toolchain defaults (pin in `WI-PORT-001`, record the exact versions there)

| Item | Default | Why |
|---|---|---|
| Node.js | Current Active LTS at the time `WI-PORT-001` starts, pinned in `.nvmrc` and `engines` | Reproducible local and CI runs |
| Package manager | npm workspaces | Nothing extra to install in CI; add pnpm only if a concrete need appears |
| Language | TypeScript, `strict: true` | |
| Workspace layout | Root `package.json` with workspaces `apps/*` and `services/graphql-bff` | BFF is a backend, so it sits beside the C# services; confirm in `WI-PORT-001` |
| Relay + Next.js integration | Evaluate the `relay-nextjs` package first; fall back to a small hand-rolled per-request environment | See `WI-PORT-001` criteria below |
| Local trace viewer | Jaeger, via Compose (OTLP in) | Simple, container-only, vendor-neutral |
| Browser tests | Playwright (TypeScript) | Target-role evidence |
| .NET | `net8.0`, unchanged | ADR-0010 |
| Branches | `feature/<WI-ID>-short-description`, per `docs/process/branching-strategy.md` | Existing convention |
| Evidence artifacts | Entries in `docs/ACTIVITY-LOG.md`; raw outputs (trace exports, test reports) under `docs/evidence/<WI-ID>/` | One log, no second ledger |

## `relay-nextjs` evaluation criteria (for `WI-PORT-001`)

Not adopted yet. A candidate is acceptable only if it:

1. Supports the **Pages Router** and the Relay major version we pin.
2. Creates a **fresh Relay environment per SSR request** (no module-level shared store).
3. Hands server-fetched data to the client without a second fetch on hydration.
4. Is maintained enough to trust: recent releases, open-issue health, and compatibility with the pinned Next.js version (check at adoption time).
5. Keeps client navigation and refetch working through Relay.

If it fails any of these, use a small in-repo implementation of the same pattern. Don't switch to App Router or Apollo (ADR-0012).

## Readiness checklist status (`06-open-items-before-delegation.md`)

- Owners assigned: **done** (this file).
- Pin runtimes and package manager: **pinned in policy, exact versions recorded in `WI-PORT-001`**.
- First GraphQL query and C# API contract: **drafted** in `docs/architecture/first-slice-contract.md`, pending approval.
- Branch/PR workflow and evidence location: **done** (above).
- Docker Compose verification: **open** (`WI-DEV-002`).
