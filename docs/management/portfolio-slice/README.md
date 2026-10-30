# Portfolio Slice — Plans

> **Status:** Index · checked 2026-10-30. Each plan carries its own status note at the top.

Implementation-approach documents for the portfolio vertical slice (Next.js SSR → GraphQL BFF → C# services, with CI, tracing and test evidence). Adopted 2026-10-26.

**Source-of-truth rules**: ADRs own decisions (ADR-0012 to ADR-0016); these plans own the implementation approach; API/schema contracts own actual behavior; work items (`WI-PORT-*`, `EPIC-PORTFOLIO-SLICE.md`) own task acceptance; commit messages, pull request text, `docs/evidence/` and the register record what actually happened (`docs/history/ACTIVITY-LOG.md` takes no new entries). Avoid duplicate or contradictory copies.

| File | Purpose | State (2026-10-30) |
|---|---|---|
| `00-implementation-brief.md` | Mission, evidence goals, first slice, ownership and safety, non-goals | Slice built; Phase 4 evidence goals not done |
| `02-vertical-slice-and-quality.md` | Slice increments, test layers, AI-assisted test experiment, CI gates, metrics | Increments 1 to 4 done; AI-assisted test experiment not done |
| `03-observability-and-pipeline.md` | OpenTelemetry and Azure Pipelines approach (decisions in ADR-0016/0015) | Built as planned; no deployment stage |
| `04-cache-and-ai-evidence.md` | Three cache layers (ADR-0014) and AI-collaboration evidence rules | Cache layers 2 and 3 undone; evidence ledger moved off the activity log |
| `05-agent-rules-and-sequence.md` | Agent task contract, rules, phased sequence | Phases 0 to 3 done; 4 not done |
| `06-open-items-before-delegation.md` | Readiness checklist before broad delegation | Snapshot; cloud items open |
| `07-shared-file-ownership-and-coordination.md` | What "one owner" means; shared-file merge ownership | In force; owners are in `09` |
| `08-existing-models-and-maps-inventory.md` | Existing models/maps to reuse rather than redraw | Mapping artifact done |
| `09-owners-and-defaults.md` | Owners, toolchain defaults and `relay-nextjs` evaluation criteria (2026-10-26) | Several defaults differ from the repo (note at the top) |

The packet's original `01-reconciliation-register.md` was folded into `WI-PORT-006` rather than kept as a second register; it is kept for history.
