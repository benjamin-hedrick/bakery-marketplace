# Existing documentation reconciliation register

> **Status:** Historical · folded into `WI-PORT-006` and its dispositions records (`docs/product/backlog/reconciliation/`). Every candidate below has since been handled: ADR-0011 is superseded by ADR-0012; `tech-stack.md` and `data-model-api-contracts.md` were amended; ADR-0002 is extended by ADR-0014; `docker-compose.yml` is built; `.github/workflows/ci.yml` was removed on 2026-10-28; `infra/` is labelled in `tech-stack.md`; apps and services were verified (`docs/evidence/facts-sheet-2026-10-29.md`).

**Proposal only. Inspect the current tree and approve a file-by-file
change plan before editing.**

For each candidate, record exact current claim, proposed change, reason,
authorizing ADR, implementation status, and related files. Mark
**retain**, **amend**, **supersede**, or **defer**.

  -----------------------------------------------------------------------------------------------------------------
  Candidate                                                         Issue to verify         Proposed disposition
  ----------------------------------------------------------------- ----------------------- -----------------------
  `docs/architecture/adr/0011-frontend-framework.md`                React/Vite SPA and      Supersede after
                                                                    Static Web Apps may     approval
                                                                    conflict with Next.js   
                                                                    SSR                     

  `docs/architecture/tech-stack.md`                                 Framework, hosting,     Amend after decisions
                                                                    runtime, or CI claims   accepted
                                                                    may be outdated         

  `docs/architecture/adr/0009-bounded-context-service-mapping.md`   Add BFF boundary        Amend only if needed
                                                                    without moving domain   
                                                                    ownership out of C#     

  `docs/architecture/data-model-api-contracts.md`                   Distinguish GraphQL     Amend
                                                                    client schema from C#   
                                                                    API/domain contracts    

  `docs/architecture/adr/0002-cache-strategy.md`                    May not define three    Amend or supersede
                                                                    layers and invalidation 
                                                                    ownership               

  `docker-compose.yml`                                              Reportedly placeholder; Defer until needed
                                                                    verify local            
                                                                    dependencies/startup    

  `.github/workflows/ci.yml`                                        Placeholder conflicts   Remove only after ADO
                                                                    with ADO-only CI/CD     is proven and required
                                                                                            checks migrated

  `infra/`                                                          Terraform skeleton may  Retain; label status
                                                                    look deployable when it accurately
                                                                    is not                  

  `apps/*` and `services/*`                                         May be                  Verify build/tests;
                                                                    scaffolding/stubs       document only actual
                                                                                            behavior
  -----------------------------------------------------------------------------------------------------------------

## Source-of-truth rules

ADRs own decisions; plans own implementation approach; API/schema
contracts own actual behavior; work items own task acceptance; evidence
ledger records what happened. Avoid duplicate or contradictory copies.
