# ADR-0015: CI/CD System of Record — Azure Pipelines

**Status:** Accepted (2026-10-26) — amends ADR-0007 (CI secret storage) and `tech-stack.md` (CI/CD row).

## Context

`tech-stack.md` lists GitHub Actions with OIDC federated login as the CI/CD choice, and ADR-0007 stores Stripe test-mode keys as GitHub Actions secrets. In practice `.github/workflows/ci.yml` is a placeholder that builds and tests nothing (open item #14). Azure DevOps Pipelines is the target CI/CD system for this project's evidence goals.

## Decision

- **GitHub remains source control**, including PRs, branch protection and GitHub Pages hosting.
- **Azure Pipelines is the single authoritative CI/CD system**: build, test, quality gates and deployment.
- **Initial gates**: format/lint/type-check, build, unit tests, schema/contract checks, with published test results and useful diagnostics. Integration tests, Playwright, security scanning, deployment gates and post-deploy smoke tests are added once their dependencies actually run.
- **Identity**: Azure Resource Manager service connections using **workload identity federation**, so no stored client secrets. CI and deploy permissions are separated. This keeps `tech-stack.md`'s "OIDC over long-lived secrets" principle.
- **CI secrets** (ADR-0007's Stripe test-mode keys): pipeline secret variables or a variable group linked to the per-environment Key Vault. Never in YAML, never echoed to logs.
- **Migration exit criteria for removing `.github/workflows/ci.yml`**: (1) the Azure pipeline runs green from a clean checkout; (2) GitHub branch protection's required checks point at the Azure Pipelines status checks; (3) docs name Azure Pipelines as authoritative. Then the placeholder is removed in one explicit migration commit, not piecemeal.

## Consequences

**Positive**
- Azure-native delivery evidence that matches the Azure hosting target.
- Federated identity keeps the "no long-lived secrets" posture.

**Negative / accepted limitations**
- Two systems, GitHub and Azure DevOps, to administer, and a GitHub ↔ ADO status-check integration to maintain.
- A transition period in which the GitHub placeholder exists but isn't authoritative. Bounded by the exit criteria above.
- `REPO-001` (docs publishing) needs a publish step that doesn't assume a GitHub Pages Action.

## Alternatives considered

1. **Stay on GitHub Actions.** Simpler single-vendor setup, but doesn't meet the Azure DevOps evidence goal.
2. **Run both indefinitely.** Rejected: two sources of truth for check status.

## Related

- ADR-0007 — amended (see its amendment note)
- `tech-stack.md` — CI/CD row
- `WI-PORT-003`, `EPIC-CI-CD`, open items #14 and #15

## Amendment 2026-10-28: exit criterion 2 waived, placeholder removed

Criterion 1 is met (green Azure run, reported by the human lead). Criterion 3 is met by this change. Criterion 2 (required checks pointing at Azure Pipelines) cannot be met: GitHub rulesets with required status checks need an enterprise plan. Decided by the human lead: the "Azure Pipelines" check (5 checks on a PR) stays a **soft manual gate**. PRs are approved by hand after reading it, and `main` is also gated by a manual pipeline run. `.github/workflows/ci.yml` (check "CI / build-and-test") is removed in this one commit. Consequence: nothing technically stops a merge with a red or missing Azure check. Revisit if the plan changes.

## Amendment note (2026-10-30: migration complete)

The migration described above is done: the GitHub Actions placeholder was removed on 2026-10-28 (see the amendment above), and `azure-pipelines.yml` is the only pipeline. The lead reported an Azure run green on 2026-10-29 (build `#20261029.4`); that run was not observed from this repository, and the check is a soft manual gate, not a required check. Whether the job runs on `ubuntu-26.04` is unverified.
