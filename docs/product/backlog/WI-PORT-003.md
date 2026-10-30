> **Status:** Done · evidence: the Outcome note under this banner; `docs/evidence/WI-PORT-003/findings.md`

# WI-PORT-003 --- Quality and CI baseline

> **Outcome note (2026-10-28):** pipeline and CI scripts written and every command run locally; **Update 2026-10-28: green run on Azure DevOps reported by the human lead, so "pipeline runs from clean checkout" is met** (the first run's id was not recorded; a later full run, `#20261029.4` on 2026-10-29, is). Original note: not run on Azure DevOps at write time. No formatter/linter gate (none chosen). Found open item #35. Evidence: `docs/evidence/WI-PORT-003/findings.md`; commands and gaps: `docs/process/quality-gates.md`.

```
WI ID:               PORT-003
Title:                Quality and CI baseline (Azure Pipelines)
Type:                 Infra/Environment
Epic:                 EPIC-PORTFOLIO-SLICE
Shared with epic(s):  EPIC-CI-CD
Hat/Owner:            Platform Engineering (delivery-pipeline owner)
Status:               Done
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
