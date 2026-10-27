# WI-PORT-003 --- Quality and CI baseline

**Prerequisites:** actual repo commands and package boundaries
inspected; coordinate pipeline-file ownership. One owner.

## Goal

Create a reliable initial quality gate that can grow with the vertical
slice.

## Scope

Document real formatter/lint/type/build/test commands; add/adjust tests
only for existing walking-skeleton behavior; create minimum Azure DevOps
pipeline; publish test results; define a flake/execution-time evidence
format.

## Acceptance

Pipeline runs from clean checkout; failures have useful diagnostics;
commands reproduce locally; exact baseline results recorded; no
credentials in YAML/logs.

Do not remove GitHub Actions placeholder until ADO and required checks
are migrated. Do not claim comprehensive coverage.
