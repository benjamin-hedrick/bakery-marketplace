# Bootstrap of the UAT environment, 2026-11-21

> **Status:** In progress · the first run of [`uat-environment.md`](../../operations/runbooks/uat-environment.md) section 1, by the human lead with the agent running the Azure CLI commands from the lead's signed-in Azure CLI (2.93.0, the same installation as the dev bootstrap of 2026-11-19, [`bootstrap-2026-11-19.md`](../WI-DEP-001/bootstrap-2026-11-19.md)). Work item: `WI-DEP-002` step 7. This record is filled in as each step is done; no step below is claimed until it has run. Names are given; ids, the tenant, the subscription and the state account's name are not.

## Steps

| Step | What | Result |
|---|---|---|
| 0 | Dev's deploy identity narrowed (section 0, register 231) | Not yet: just before `feature/uat-environment` is merged |
| 1 | Foundation: `"uat"` added to `app_identities`, plan adds exactly two resources, apply | Not yet |
| 2 | `rg-bakery-uat` in East US 2 (`eastus2`), empty, tags `Stack=environment ManagedBy=bootstrap` (as dev's). `az group exists` said false first | **Created** 2026-11-21, provisioning state Succeeded |
| 3 | Container `tfstate-uat` in the state account, created with `--auth-mode login` (the account has no shared key access). `az storage container exists` said false first | **Created** 2026-11-21, no public access, as `tfstate` |
| 4 | Connection `bakery-uat-deploy` (the lead: workload identity federation, automatic, resource group `rg-bakery-uat`, not granted to all pipelines). Its identity found by the connection id at the end of its display name: one federated credential, no password, no certificate. Roles set by the agent (below) | **Created**; roles set except Managed Identity Operator, which needs foundation step 1 |
| 5 | Connection `bakery-uat-plan`, made the same way; the same credential check | **Created**; roles set |
| 6 | Approval environments `uat-infra`, `uat-app`, `uat-destroy` (the lead: approval, branch control `main`, exclusive lock) | **Done by the lead**, as the lead reported; not read by the agent |
| 7 | Pipeline `bakery-uat-operations` and its variables | Not yet |
| 8 | Rehearsal run | Not yet |

## The UAT pipeline identities' roles, as applied and listed afterwards

Before: each identity held only the Contributor on `rg-bakery-uat` that Azure DevOps gives. The agent ran a script (dry run first, then applied) from the lead's Azure CLI: it removed the plan identity's Contributor and added the rest. The role-assignment condition was read from dev's live assignment on `rg-bakery-dev` and applied unchanged, with `az rest` and a JSON body (the `az.cmd` wrapper breaks braces and `!`); it is the condition in [`bootstrap-2026-11-19.md`](../WI-DEP-001/bootstrap-2026-11-19.md).

| Identity | Role | Scope | Condition |
|---|---|---|---|
| bakery-uat-plan | Reader | the subscription | none |
| bakery-uat-plan | Storage Blob Data Reader | the `tfstate-uat` container | none |
| bakery-uat-deploy | Contributor | `rg-bakery-uat` (given by Azure DevOps) | none |
| bakery-uat-deploy | Role Based Access Control Administrator | `rg-bakery-uat` | yes: dev's (write and delete of a role assignment only for Key Vault Secrets User and Key Vault Secrets Officer) |
| bakery-uat-deploy | Storage Blob Data Contributor | the `tfstate-uat` container | none |
| bakery-uat-deploy | Reader | `rg-bakery-foundation` | none |
| bakery-uat-deploy | AcrPull | the foundation's registry | none |
| bakery-uat-deploy | Managed Identity Operator | `id-bakery-uat-apps` | **not yet**: created by foundation step 1 |

Checked offline against the pipeline's own rule (`compareRoles` and `expectedRoles` of `scripts/ci/identity-check.mjs`, environment `uat`, the deploy identity checked as the plan identity checks it): the plan identity's set is exactly the expected one; the deploy identity's only problem is the missing Managed Identity Operator. Neither identity has a role on anything of dev's. The pipeline's own identity checks run on the first UAT run.

## The state account, read after step 3

Read with `az storage account show` and `az storage account blob-service-properties show` (read only): shared key access off, public blob access off, TLS 1.2 minimum, blob versioning on, blob soft delete on. **Container soft delete is off**, as the dev bootstrap made the account (its runbook turns on blob soft delete only): a deleted container would not be recoverable, and each deploy identity's Storage Blob Data Contributor on its own container includes deleting it. Not changed; register 233, for the lead.
