# Procedure: bootstrap the Terraform state and the pipeline identities

> **Status:** Current · written 2026-10-31, **run 2026-11-19** by the lead (record: [`bootstrap-2026-11-19.md`](../../evidence/WI-DEP-001/bootstrap-2026-11-19.md)); steps 1 to 5 and checks 1 to 5 done and this page corrected from the run; check 6 passed for `bakery-plan` on 2026-11-20 (the dev pipeline's plan stage, build 70: [`foundation-apply-and-first-plan-2026-11-20.md`](../../evidence/WI-DEP-001/foundation-apply-and-first-plan-2026-11-20.md)); for `bakery-deploy` it waits for the real apply stage. Decision: ADR-0020. Needs the lead's Azure subscription and rights (Owner or equivalent on the subscription); IAM changes need the lead's approval.

**Purpose.** Terraform cannot create the place its own state lives, and the pipeline cannot create its own identity. A person does both once, here. Afterwards Terraform and the pipeline manage everything else. Nothing in this procedure creates or stores a secret: the state is reached with Entra identities (no storage key), and the pipeline connects with workload identity federation (no password).

## The access design (register item 106, approved by the lead 2026-10-31)

This is the approved design. If a step shows it cannot be done as written (the role condition in particular), stop and record it; the fallback is that the lead applies the role assignments by hand.

- A **plan** identity that can only read: Reader on the subscription and Storage Blob Data Reader on the state container.
- A **deploy** identity: Contributor on the dev resource group and the foundation resource group only (not the subscription), AcrPush on the registry, Storage Blob Data Contributor on the state container. (As done on 2026-11-19 and 2026-11-20. Proposed on 2026-11-21 to narrow before UAT exists, register 231: Reader in place of Contributor on the foundation group, no role-assignment right there, Managed Identity Operator on the dev apps identity; `uat-environment.md`, section 0.)
- The dev stack creates role assignments (for example AcrPull for the container apps' identity, Key Vault roles). Writing role assignments needs more than Contributor; give the deploy identity **Role Based Access Control Administrator** on those two resource groups only, constrained to the roles it needs (AcrPull, Key Vault Secrets User, Key Vault Secrets Officer; the last was added on 2026-10-31, register item 108), or run the stack's role assignments yourself. As applied 2026-11-19: on the dev group only the two Key Vault roles (the dev stack assigns no AcrPull; the foundation does, on the registry), for both writing and deleting an assignment (the teardown deletes them), with no condition on the principal type (the stacks send none). This is the privileged step ADR-0018 asked you to keep out of the pipeline's reach; the pipeline gets only the constrained role on these two groups and no Graph permission.
- The dev resource group is **created here** (empty) and the environment stack works inside it. Teardown then removes what is in it and leaves the empty group, so the deploy identity never needs rights over the whole subscription and a destroy can never remove the group's role assignments for the pipeline.

## Steps

Set `$SUB`, `$LOC` (the region, for example `eastus`) and a storage account name `$SA` (3 to 24 lower-case letters and digits, globally unique, for example `stbakerytf` plus a few characters of your own).

1. **Sign in** with your own account: `az login --tenant <tenant id>`; `az account set --subscription $SUB`. Name the tenant: when it requires multi-factor authentication, a plain `az login` signs in but lists no subscription (seen 2026-11-19).
   **Register the resource providers** the stacks use, once per subscription (the pipeline identities only have rights on resource groups and cannot): `Microsoft.Storage`, `Microsoft.App`, `Microsoft.OperationalInsights`, `Microsoft.DocumentDB`, `Microsoft.KeyVault`, `Microsoft.ContainerRegistry`, `Microsoft.ManagedIdentity`, each with `az provider register -n <namespace> --wait`; `az provider show -n <namespace> --query registrationState` must say `Registered`. A new subscription has none of them.
2. **State resource group and account.**
   ```
   az group create -n rg-bakery-tfstate -l $LOC
   az storage account create -n $SA -g rg-bakery-tfstate -l $LOC --sku Standard_LRS --kind StorageV2 \
     --min-tls-version TLS1_2 --allow-blob-public-access false --allow-shared-key-access false
   az storage account blob-service-properties update --account-name $SA -g rg-bakery-tfstate \
     --enable-versioning true --enable-delete-retention true --delete-retention-days 30 \
     --enable-container-delete-retention true --container-delete-retention-days 30
   az storage container create --account-name $SA -n tfstate --auth-mode login
   az lock create --name keep-state --lock-type CanNotDelete -g rg-bakery-tfstate
   ```
   `--allow-shared-key-access false` is what makes "no storage key" true: there is nothing to leak. You need a data-plane role to create the container (step 3 first if the last command is refused).
3. **Your own access to the state**: assign yourself `Storage Blob Data Owner` on the account (`az role assignment create`).
4. **The resource groups** the stacks work in: `rg-bakery-foundation` is created by the foundation stack itself on its first apply (by you, from your machine or the first gated run); `rg-bakery-dev` is created here, empty: `az group create -n rg-bakery-dev -l $LOC --tags Stack=environment ManagedBy=bootstrap`.
5. **The pipeline identities.** In Azure DevOps, **Project settings > Service connections > New > Azure Resource Manager > Workload identity federation (automatic)**. The dialog requires a resource group (it offers the groups, "All resource groups" or a default): choose **`rg-bakery-dev`**, never "All resource groups" (that is Contributor on the subscription). Azure DevOps then gives the identity **Contributor on that group** itself. Create two, `bakery-plan` and `bakery-deploy`, and for each **do not** tick "Grant access permission to all pipelines". The id Azure DevOps shows is the service connection's id; the service principal's display name ends with it, which is how to find it (`az role assignment list --all` lists the two Contributor assignments). Then give each only the roles in the list above: **remove** `bakery-plan`'s Contributor; for `bakery-deploy` keep it and add the rest. The constrained Role Based Access Control Administrator needs a condition; create it with `az rest --method put` and a JSON body (`roleDefinitionId`, `principalId`, `principalType`, `condition`, `conditionVersion` 2.0) because the Windows `az.cmd` wrapper breaks the braces and `!` of a condition on the command line. The condition as applied is in the record. Note the connection ids; the pipeline takes them as variables, not as text in the repository.
   **After the foundation's first apply** (`rg-bakery-foundation` does not exist before it): give `bakery-deploy` Contributor on that group and the constrained role-assignment right there for AcrPush and AcrPull (the foundation stack assigns those on the registry).
6. **Write the values down** where the pipeline reads them: the state account name and resource group go into pipeline variables; they are not secrets.

## Verify (this replaces a separate test procedure)

1. As yourself: `az storage blob list --account-name $SA -c tfstate --auth-mode login -o table` lists (empty is fine). It must work **without** `--account-key`.
2. A key must fail: `az storage blob list --account-name $SA -c tfstate --auth-mode key` is refused (shared key access is off).
3. Versioning and soft delete: `az storage account blob-service-properties show --account-name $SA -g rg-bakery-tfstate --query "{versioning:isVersioningEnabled, delete:deleteRetentionPolicy, containerDelete:containerDeleteRetentionPolicy}"`: all three on (container soft delete added 2026-11-21, register 233; a deleted state container is then recoverable for 30 days).
4. The lock: try `az group delete -n rg-bakery-tfstate` and expect it to be refused.
5. Initialise the foundation stack against it (on Windows run Terraform from Git Bash: PowerShell 5.1 splits `-backend-config=backend.hcl` at the dot; Terraform's Azure sign-in calls `az`, so the Azure CLI must be on `PATH`): copy `infra/foundation/backend.hcl.example` to `backend.hcl` with your account name and run `terraform init -backend-config=backend.hcl` in `infra/foundation`; then `terraform plan` (needs `ARM_SUBSCRIPTION_ID`) shows the resource group, the registry and role assignments to create. Do not apply from here until the gates are proved ([`prove-the-pipeline-gates.md`](prove-the-pipeline-gates.md)).
6. Each pipeline identity: run a pipeline step that reports `az account show` and `az role assignment list --assignee <id>`; the roles must be exactly the ones above, and `bakery-plan` must fail to create anything.

## What not to do

- Do not create a storage key, a SAS token or a service principal secret "just to get going". If a step seems to need one, stop and record why.
- Do not put the state account in the foundation or an environment stack: it must outlive both and Terraform must not be able to destroy it.
- Do not give a pipeline identity Owner, or Contributor on the subscription.

## Escalate when

A role the pipeline needs cannot be limited as described, or Azure refuses `--allow-shared-key-access false` for the Terraform backend. Record it in the register and change the design deliberately (ADR-0020 amendment), not in a hurry.

## Last tested

2026-11-19, by the lead (the agent ran the commands from the lead's signed-in Azure CLI): steps 1 to 5 and checks 1 to 5 passed; check 6 not run. Record: [`bootstrap-2026-11-19.md`](../../evidence/WI-DEP-001/bootstrap-2026-11-19.md). 2026-11-20, in the dev pipeline (build 70): check 6 passed for `bakery-plan`, the step in `azure-pipelines-dev.yml`. Written 2026-10-31.
