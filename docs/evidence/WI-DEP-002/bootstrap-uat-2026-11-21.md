# Bootstrap of the UAT environment, 2026-11-21

> **Status:** In progress · the first run of [`uat-environment.md`](../../operations/runbooks/uat-environment.md) section 1, by the human lead with the agent running the Azure CLI commands from the lead's signed-in Azure CLI (2.93.0, the same installation as the dev bootstrap of 2026-11-19, [`bootstrap-2026-11-19.md`](../WI-DEP-001/bootstrap-2026-11-19.md)). Work item: `WI-DEP-002` step 7. This record is filled in as each step is done; no step below is claimed until it has run. Names are given; ids, the tenant, the subscription and the state account's name are not.

## Steps

| Step | What | Result |
|---|---|---|
| 0 | Dev's deploy identity narrowed (section 0, register 231) | Not yet: just before `feature/uat-environment` is merged |
| 1 | Foundation: `"uat"` added to `app_identities`, plan adds exactly two resources, apply | Not yet |
| 2 | `rg-bakery-uat` in East US 2 (`eastus2`), empty, tags `Stack=environment ManagedBy=bootstrap` (as dev's). `az group exists` said false first | **Created** 2026-11-21, provisioning state Succeeded |
| 3 | Container `tfstate-uat` in the state account, created with `--auth-mode login` (the account has no shared key access). `az storage container exists` said false first | **Created** 2026-11-21, no public access, as `tfstate` |
| 4 | Connection `bakery-uat-deploy` (Azure DevOps, the lead) and its roles (the agent, after the lead's approval) | Not yet |
| 5 | Connection `bakery-uat-plan` and its roles | Not yet |
| 6 | Approval environments `uat-infra`, `uat-app`, `uat-destroy` | Not yet |
| 7 | Pipeline `bakery-uat-operations` and its variables | Not yet |
| 8 | Rehearsal run | Not yet |

## The state account, read after step 3

Read with `az storage account show` and `az storage account blob-service-properties show` (read only): shared key access off, public blob access off, TLS 1.2 minimum, blob versioning on, blob soft delete on. **Container soft delete is off**, as the dev bootstrap made the account (its runbook turns on blob soft delete only): a deleted container would not be recoverable, and each deploy identity's Storage Blob Data Contributor on its own container includes deleting it. Not changed; register 233, for the lead.
