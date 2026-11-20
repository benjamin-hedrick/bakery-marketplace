# Bootstrap of the Terraform state and the pipeline identities, 2026-11-19

> **Status:** Current · the first run of [`bootstrap-terraform-state.md`](../../operations/runbooks/bootstrap-terraform-state.md), by the human lead with the agent running the commands from the lead's signed-in Azure CLI. Work item: `WI-DEP-001`. Decision: ADR-0020. Identifiers (subscription, tenant, object ids, the storage account and registry names) are left out on purpose: they are not secrets, but this repository is public; the storage account and registry names go into pipeline variables.

## What was created

| Step | What | Result |
|---|---|---|
| Tools | Azure CLI 2.93.0 and Terraform 1.17.1 installed with `winget` (neither was on the machine; the repository's Terraform checks run in a pinned Docker image) | Installed |
| 1 | Sign-in. The tenant requires multi-factor authentication, so a plain `az login` lists no subscription; `az login --tenant <tenant id>` works | Signed in; the lead is Owner on the subscription |
| 1a (not in the runbook) | The subscription had never used these resource types: `Microsoft.Storage`, `Microsoft.App`, `Microsoft.OperationalInsights`, `Microsoft.DocumentDB`, `Microsoft.KeyVault`, `Microsoft.ContainerRegistry`, `Microsoft.ManagedIdentity` were `NotRegistered`. Registered with `az provider register --wait`. The pipeline identities cannot do this (their rights are on resource groups), so it is a bootstrap step | All seven `Registered` |
| 2 | `rg-bakery-tfstate` (eastus), a StorageV2 Standard_LRS account with TLS 1.2, no public blob access and **no shared key access**, versioning and 30-day soft delete, container `tfstate`, lock `keep-state` (CanNotDelete) | Created |
| 3 | The lead: Storage Blob Data Owner on the account. Done **before** the container, so the container is created with `--auth-mode login` on the first attempt | Created |
| 4 | `rg-bakery-dev` (eastus), empty, tags `Stack=environment ManagedBy=bootstrap` | Created |
| 5 | Two Azure DevOps service connections, workload identity federation (automatic): `bakery-plan` and `bakery-deploy`. The dialog does not allow "no resource group": it offers the groups, "All resource groups" (that would be Contributor on the subscription) or a default; `rg-bakery-dev` was chosen for both. Azure DevOps then gave each identity **Contributor on `rg-bakery-dev`**. Each app registration has one federated credential and no password or certificate | Created |
| 5 roles | Approved by the lead, then applied (below) | Applied |

## The pipeline identities' roles, as applied and listed afterwards

| Identity | Role | Scope | Condition |
|---|---|---|---|
| bakery-plan | Reader | the subscription | none |
| bakery-plan | Storage Blob Data Reader | the `tfstate` container | none |
| bakery-deploy | Contributor | `rg-bakery-dev` (given by Azure DevOps) | none |
| bakery-deploy | Storage Blob Data Contributor | the `tfstate` container | none |
| bakery-deploy | Role Based Access Control Administrator | `rg-bakery-dev` | yes: write and delete of a role assignment only for Key Vault Secrets User (`4633458b-17de-408a-b874-0445c86b69e6`) and Key Vault Secrets Officer (`b86a8fe4-44ce-4948-aee5-eccb2c155cd7`) |

`bakery-plan`'s Contributor on `rg-bakery-dev`, given by Azure DevOps, was removed. The condition, as applied (condition version 2.0, created with `az rest` and a JSON body because the Windows `az.cmd` wrapper breaks the braces and `!`):

```
((!(ActionMatches{'Microsoft.Authorization/roleAssignments/write'}))
  OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {4633458b-17de-408a-b874-0445c86b69e6, b86a8fe4-44ce-4948-aee5-eccb2c155cd7}))
AND
((!(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'}))
  OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {4633458b-17de-408a-b874-0445c86b69e6, b86a8fe4-44ce-4948-aee5-eccb2c155cd7}))
```

Two choices narrower than the runbook's list: AcrPull is not in the dev group's condition (the foundation stack assigns AcrPull, on the registry, not the dev stack), and the condition does not constrain the principal type (the stacks' `azurerm_role_assignment` resources send none). Azure accepted the condition; whether it lets the dev stack's two Key Vault assignments through, and refuses others, is proved only by the first apply (register 106).

Not done yet, because `rg-bakery-foundation` does not exist until the foundation's first apply: the deploy identity's Contributor on that group and its constrained role-assignment right there (for the registry's AcrPush and AcrPull).

## Verification

| Check | Expected | Seen |
|---|---|---|
| V1 `az storage blob list ... --auth-mode login` | lists, empty is fine | Pass: listed, empty, exit 0 |
| V2 `az storage blob list ... --auth-mode key` | refused | Pass: `ErrorCode:KeyBasedAuthenticationNotPermitted` |
| V3 blob service properties | versioning on, delete retention on | Pass: versioning True, delete retention True, 30 days |
| V4 `az group delete -n rg-bakery-tfstate --yes` (run only after `az lock list` showed `keep-state CanNotDelete`) | refused | Pass: `Code: ScopeLocked` |
| V5 `terraform init -backend-config=backend.hcl` and `terraform plan` in `infra/foundation`, as the lead | the resource group, registry and role assignments to create | Pass: init against the remote state; `Plan: 5 to add, 0 to change, 0 to destroy` (the resource group, the registry, the dev apps identity, AcrPush for `bakery-deploy`, AcrPull for the identity). **Nothing applied** |
| V6 each pipeline identity reports its own roles from a pipeline step | exactly the roles above; `bakery-plan` cannot create anything | **Not run**: needs a pipeline step with the service connections (the next piece of work) |

V5 ran in Git Bash: Windows PowerShell 5.1 splits `-backend-config=backend.hcl` at the dot and Terraform refuses the stray argument. The plan used a variables file outside the repository (registry name, location `eastus`, `app_identities = ["dev"]`, the deploy identity as the AcrPush principal) and no budget e-mail, so no budget is planned yet.

## Found and recorded

- The runbook did not register the resource providers, assumed a "no resource group" option in the service connection dialog and did not say Azure DevOps grants Contributor itself: corrected in the runbook.
- The read-only plan identity is likely unable to plan the dev stack (state lock and secret reads): register 213.
