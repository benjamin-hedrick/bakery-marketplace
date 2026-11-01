# Procedure: bootstrap the Terraform state and the pipeline identities

> **Status:** Draft · written 2026-10-31, **not yet run**. The commands are from the Azure CLI and Terraform documentation as I know them, not from a run; check each against `az ... --help` before using it. Decision: ADR-0020. Needs the lead's Azure subscription and rights (Owner or equivalent on the subscription); IAM changes need the lead's approval.

**Purpose.** Terraform cannot create the place its own state lives, and the pipeline cannot create its own identity. A person does both once, here. Afterwards Terraform and the pipeline manage everything else. Nothing in this procedure creates or stores a secret: the state is reached with Entra identities (no storage key), and the pipeline connects with workload identity federation (no password).

## The access design (register item 106, approved by the lead 2026-10-31)

This is the approved design. If a step shows it cannot be done as written (the role condition in particular), stop and record it; the fallback is that the lead applies the role assignments by hand.

- A **plan** identity that can only read: Reader on the subscription and Storage Blob Data Reader on the state container.
- A **deploy** identity: Contributor on the dev resource group and the foundation resource group only (not the subscription), AcrPush on the registry, Storage Blob Data Contributor on the state container.
- The dev stack creates role assignments (for example AcrPull for the container apps' identity, Key Vault roles). Writing role assignments needs more than Contributor; give the deploy identity **Role Based Access Control Administrator** on those two resource groups only, constrained to the roles it needs (AcrPull, Key Vault Secrets User, Key Vault Secrets Officer; the last was added on 2026-10-31, register item 108), or run the stack's role assignments yourself. This is the privileged step ADR-0018 asked you to keep out of the pipeline's reach; the pipeline gets only the constrained role on these two groups and no Graph permission.
- The dev resource group is **created here** (empty) and the environment stack works inside it. Teardown then removes what is in it and leaves the empty group, so the deploy identity never needs rights over the whole subscription and a destroy can never remove the group's role assignments for the pipeline.

## Steps

Set `$SUB`, `$LOC` (the region, for example `eastus`) and a storage account name `$SA` (3 to 24 lower-case letters and digits, globally unique, for example `stbakerytf` plus a few characters of your own).

1. **Sign in** with your own account: `az login`; `az account set --subscription $SUB`.
2. **State resource group and account.**
   ```
   az group create -n rg-bakery-tfstate -l $LOC
   az storage account create -n $SA -g rg-bakery-tfstate -l $LOC --sku Standard_LRS --kind StorageV2 \
     --min-tls-version TLS1_2 --allow-blob-public-access false --allow-shared-key-access false
   az storage account blob-service-properties update --account-name $SA -g rg-bakery-tfstate \
     --enable-versioning true --enable-delete-retention true --delete-retention-days 30
   az storage container create --account-name $SA -n tfstate --auth-mode login
   az lock create --name keep-state --lock-type CanNotDelete -g rg-bakery-tfstate
   ```
   `--allow-shared-key-access false` is what makes "no storage key" true: there is nothing to leak. You need a data-plane role to create the container (step 3 first if the last command is refused).
3. **Your own access to the state**: assign yourself `Storage Blob Data Owner` on the account (`az role assignment create`).
4. **The resource groups** the stacks work in: `rg-bakery-foundation` is created by the foundation stack itself on its first apply (by you, from your machine or the first gated run); `rg-bakery-dev` is created here, empty: `az group create -n rg-bakery-dev -l $LOC --tags Stack=environment ManagedBy=bootstrap`.
5. **The pipeline identities.** In Azure DevOps, **Project settings > Service connections > New > Azure Resource Manager > Workload identity federation (automatic)**, scope to the subscription, no resource group at creation. Create two, `bakery-plan` and `bakery-deploy`, and for each **do not** tick "Grant access permission to all pipelines". Then give each only the roles in the list above (`az role assignment create`, scoped to the account, the resource groups and the registry as listed). Note the connection ids; the pipeline takes them as variables, not as text in the repository.
6. **Write the values down** where the pipeline reads them: the state account name and resource group go into pipeline variables; they are not secrets.

## Verify (this replaces a separate test procedure)

1. As yourself: `az storage blob list --account-name $SA -c tfstate --auth-mode login -o table` lists (empty is fine). It must work **without** `--account-key`.
2. A key must fail: `az storage blob list --account-name $SA -c tfstate --auth-mode key` is refused (shared key access is off).
3. Versioning and soft delete: `az storage account blob-service-properties show --account-name $SA -g rg-bakery-tfstate --query "{versioning:isVersioningEnabled, delete:deleteRetentionPolicy}"`.
4. The lock: try `az group delete -n rg-bakery-tfstate` and expect it to be refused.
5. Initialise the foundation stack against it: copy `infra/foundation/backend.hcl.example` to `backend.hcl` with your account name and run `terraform init -backend-config=backend.hcl` in `infra/foundation`; then `terraform plan` (needs `ARM_SUBSCRIPTION_ID`) shows the resource group, the registry and role assignments to create. Do not apply from here until the gates are proved ([`prove-the-pipeline-gates.md`](prove-the-pipeline-gates.md)).
6. Each pipeline identity: run a pipeline step that reports `az account show` and `az role assignment list --assignee <id>`; the roles must be exactly the ones above, and `bakery-plan` must fail to create anything.

## What not to do

- Do not create a storage key, a SAS token or a service principal secret "just to get going". If a step seems to need one, stop and record why.
- Do not put the state account in the foundation or an environment stack: it must outlive both and Terraform must not be able to destroy it.
- Do not give a pipeline identity Owner, or Contributor on the subscription.

## Escalate when

A role the pipeline needs cannot be limited as described, or Azure refuses `--allow-shared-key-access false` for the Terraform backend. Record it in the register and change the design deliberately (ADR-0020 amendment), not in a hurry.

## Last tested

Never. Written 2026-10-31.
