# Portfolio Slice — Plans

Implementation-approach documents for the portfolio vertical slice (Next.js SSR → GraphQL BFF → C# services, with CI, tracing and test evidence). Adopted 2026-10-26.

**Source-of-truth rules**: ADRs own decisions (ADR-0012 to ADR-0016); these plans own the implementation approach; API/schema contracts own actual behavior; work items (`WI-PORT-*`, `EPIC-PORTFOLIO-SLICE.md`) own task acceptance; `docs/ACTIVITY-LOG.md` records what actually happened. Avoid duplicate or contradictory copies.

| File | Purpose |
|---|---|
| `00-implementation-brief.md` | Mission, target-role evidence, first slice, ownership and safety, non-goals |
| `02-vertical-slice-and-quality.md` | Slice increments, test layers, AI-assisted test experiment, CI gates, metrics |
| `03-observability-and-pipeline.md` | OpenTelemetry and Azure Pipelines approach (decisions in ADR-0016/0015) |
| `04-cache-and-ai-evidence.md` | Three cache layers (ADR-0014) and AI-collaboration evidence rules |
| `05-agent-rules-and-sequence.md` | Agent task contract, rules, phased sequence |
| `06-open-items-before-delegation.md` | Readiness checklist before broad delegation |
| `07-shared-file-ownership-and-coordination.md` | What "one owner" means; shared-file merge ownership |
| `08-existing-models-and-maps-inventory.md` | Existing models/maps to reuse rather than redraw |

The packet's original `01-reconciliation-register.md` was folded into `WI-PORT-006` rather than kept as a second register.
