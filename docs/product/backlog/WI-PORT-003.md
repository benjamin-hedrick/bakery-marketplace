# WI-PORT-003 --- Quality and CI baseline

> **Outcome note (2026-10-28):** pipeline and CI scripts written and every command run locally; **not run on Azure DevOps**, so the acceptance item "pipeline runs from clean checkout" is open. No formatter/linter gate (none chosen). Found open item #35. Evidence: `docs/evidence/WI-PORT-003/findings.md`; commands and gaps: `docs/process/quality-gates.md`.

```
WI ID:               PORT-003
Title:                Quality and CI baseline (Azure Pipelines)
Type:                 Infra/Environment
Epic:                 EPIC-PORTFOLIO-SLICE
Shared with epic(s):  EPIC-CI-CD
Hat/Owner:            Platform Engineering (delivery-pipeline owner)
Status:               Ready
Size:                 TBD
```

**Decisions**: ADR-0015 (Azure Pipelines; migration exit criteria), ADR-0007 amendment (CI secrets via pipeline secret variables / Key Vault-linked variable group; workload identity federation).

**Relationship to existing backlog**: supersedes `CI-001` (real build/test stages replacing the placeholder). Builds and tests the existing .NET solution (`BakeryMarketplace.slnx`, `tools/BakeryMarketplace.slnx`) from day one; frontend/BFF stages are added as `WI-PORT-002` lands. See also reconciliation finding A8 (2026-10-25): integration tests currently fall back to fakes without Docker dependencies, so make that visible in CI output rather than silently passing.

**Prerequisites:** actual repo commands and package boundaries
inspected; coordinate pipeline-file ownership. One owner.

## Goal

Create a reliable initial quality gate that can grow with the vertical
slice.

## Scope

Document real formatter/lint/type/build/test commands; add/adjust tests
only for existing walking-skeleton behavior; create minimum Azure Pipelines
pipeline; publish test results; define a flake/execution-time evidence
format.

## Acceptance

Pipeline runs from clean checkout; failures have useful diagnostics;
commands reproduce locally; exact baseline results recorded; no
credentials in YAML/logs.

Do not remove the GitHub Actions placeholder until ADR-0015's exit
criteria are met (Azure pipeline green, required checks migrated, docs
updated); then remove it in one explicit migration commit. Do not claim comprehensive coverage.
