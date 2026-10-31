# ADR-0020: Deployment pipeline, environments and configuration

**Status:** Proposed (2026-10-31)

ADR-0019 is reserved in the planning documents for the cookie session (`N-01`) and is not written; this ADR takes the next free number.

## Context

Nothing is deployed (`WI-DEP-001`). The lead wants a deployed dev environment that can be created and torn down on demand, with every step beyond the existing checks gated by a manual approval in Azure, and a design for UAT and Prod that will be reviewed but never run. The existing pipeline (`azure-pipelines.yml`, ADR-0015) runs on pull requests into `main` and by hand, and must keep working unchanged.

What was established while designing it (2026-10-31):

- The .NET services and the BFF already read their configuration from environment variables, so a platform can set it per environment with no code change.
- The Next.js web app cannot yet. `rewrites()` is evaluated at build time and the destination is stored in the image (`.next/routes-manifest.json` holds `"destination": "http://graphql-bff:4100/graphql"`); running the same image with another `GRAPHQL_URL` did not change where `/api/graphql` goes (tested 2026-10-31: the request failed against the baked address and never reached a listener at the new one). `NEXT_PUBLIC_*` values are inlined into the browser bundle. Register item 101.
- Terraform sets what a platform resource looks like (including a container's environment variables); it does not rewrite files inside a built image. The Azure Pipelines file-transform and token-replacement tasks work on files in a pipeline workspace or package, not on an image already built. Azure App Configuration is a managed key-value and feature-flag store that an application reads at run time; it supplies values and does not change what a build froze.

## Decision (proposed)

1. **Build once, promote by digest, configure at deploy time.** Each commit that is deployed produces one image per runtime, identified by digest. Environments differ only by configuration: container environment variables set by Terraform from that environment's variable file, and Key Vault references for secrets (ADR-0007). No environment has its own build.
2. **The web app is changed once to fit that rule** (a work item under `WI-DEP-001`): a run-time proxy route in place of the build-time rewrite, and a run-time configuration endpoint for the login addresses. Latency of the BFF path is measured before and after (`scripts/dev/measure-latency.mjs`) and kept as architecture evidence. A start-up edit of `routes-manifest.json` would avoid the code change but depends on a framework-internal file; it is not chosen.
3. **Two stacks, two lifetimes.** A **foundation** stack stays up (container registry, and Log Analytics when needed). An **environment** stack (resource group, Container Apps environment, data, Key Vault, identities) is created and destroyed on demand, so a teardown does not delete the images. The state storage account that holds both stacks' state is created by a documented one-time bootstrap, not by Terraform.
4. **Terraform state** lives in an Azure Storage blob container, one state file per stack and environment, accessed with Entra authentication (no storage keys), with blob versioning and soft delete. State holds no secret values (ADR-0007).
5. **What runs when** (`azure-pipelines.yml` is extended; its triggers do not change):
   - Every pull request into `main`: the existing jobs, plus `terraform fmt -check`, `terraform validate` (no credentials) and a build of the four images without pushing.
   - A pull request that changes `infra/**` (or the pipeline files): also `terraform plan` against the dev state, `-lock=false`, with a connection that can only read. The plan is published as an artifact.
   - A manual run on `main`, with parameters for the action and the environment: build and push images, then two separately approved stages (below).
6. **Infrastructure and application deploys are separate stages with separate approvals.** The infrastructure stage always runs `terraform plan -detailed-exitcode`; it asks for approval and applies the saved plan only if the plan has changes, so a run with no infrastructure change has no infrastructure approval. Terraform creates each container app with a placeholder image and ignores later image changes; the application stage, after its own approval, updates each app to the new digest and runs the post-deploy smoke against the deployed address.
7. **Teardown** is a manual run of the same pipeline with the action `destroy`, an approval on its own environment, a typed confirmation of the environment name, and a guard that fails if the destroy plan touches anything outside the environment's resource group. There is no automatic or scheduled teardown. A budget alert (a notification only) and scale-to-zero limit idle cost. A runbook covers the steps.
8. **Gates are Azure DevOps Environments** with approvals, a branch-control check (only `main`) and an exclusive lock, configured in the Azure DevOps interface and listed in a setup checklist. Two service connections use workload identity federation: one read-only for plan, one scoped to the dev resource group for apply and deploy (pipeline-permission limited to the pipeline that needs it).
9. **UAT and Prod are a second pipeline file**, `azure-pipelines-promote.yml`, with `trigger: none` and `pr: none`, that the lead reviews and does not run. It is never registered as a pipeline, or is registered with no service connection and no environments. Both pipelines use the same templates in `pipelines/templates/`, so the dev runs exercise the code that UAT and Prod would use. Promotion imports the same image digest into that environment's registry, applies that environment's variable file and state, and requires a recorded passing smoke in the previous environment plus approval. `terraform validate` runs on the `uat` and `prod` folders. (The existing `infra/environments/staging` folder is renamed `uat`.)

## Consequences

**Positive:** one artifact tested everywhere; the approval you give is for the exact plan applied; no infrastructure approval when nothing changed; an unrun UAT/Prod path that is still checked for syntax and shares code with the path that runs.

**Negative / accepted:** a registry adds a fixed cost (`budget-cost-estimate.md`); the web proxy adds a Node hop to every BFF call; gates configured in the Azure interface cannot be reviewed from the repository; nothing here has run on Azure.

## Not verified (as of this ADR)

Everything. No Azure subscription, Terraform binary or `az` CLI has been used for this design; the pipeline YAML, the environment checks, the workload identity federation, the key vault purge behaviour on destroy and the Cosmos free-tier limit are from documentation and general knowledge and need a first run. An unreferenced Azure DevOps environment name is created without checks when a run first uses it, so the UAT and Prod stages must not be reachable until their environments exist.

## Amendment (2026-10-31): decision 2, built

The run-time proxy is an API route (`/api/graphql`), chosen by the lead after a spike that also built a `proxy.ts` variant (`docs/evidence/WI-DEP-001/web-runtime-config-spike-2026-10-31.md`). It forwards a fixed list of request headers; test-only headers are added through `GRAPHQL_EXTRA_FORWARDED_HEADERS`, empty in a deployed environment. The run-time configuration endpoint for the login settings is built too: `GET /api/config` serves `AUTH_ISSUER` and `AUTH_CLIENT_ID`, required in production with no default (register item 101, resolved 2026-10-31).

## Amendment (2026-10-31): the dev operations pipeline is its own file; the foundation stack is written

Decision 5 said `azure-pipelines.yml` would be extended with the manual run. It is not: the manual dev operations are a separate pipeline file, `azure-pipelines-dev.yml` (`trigger: none`, `pr: none`), so the pull-request pipeline keeps its triggers and every job and gains only a `terraform` job with no Azure access. This keeps "everything existing works as-is" true and means a pull request cannot start or change what the dev operations do except by editing a file that has no trigger. The dev pipeline is at first a **rehearsal** that only prints, used to prove the environment gates (`docs/operations/runbooks/prove-the-pipeline-gates.md`); real steps are added one stage at a time, each rehearsed first. The foundation stack (`infra/foundation`) is written and passes format, validate and mocked-provider tests; it has not been planned against Azure. Proposed, not yet decided: the dev resource group is created empty by the bootstrap and the environment stack works inside it, so teardown removes what is inside and the deploy identity needs rights on that group only (register item 106).

## Before the repository is made public

The Azure DevOps settings to confirm on that day (fork builds without secrets, connection permissions, environment checks, run-log visibility, the mock issuer's reachability) are listed in register item 93, which holds the flip-day checklist. They are configured in the Azure interface and cannot be checked from the repository.

## Alternatives considered

1. **A build per environment.** Rejected by the lead: the artifact that was tested is not the artifact that is deployed.
2. **Azure App Configuration for all settings.** Not needed for a few non-secret values; the services already read environment variables. Reconsider if configuration must change without a restart.
3. **Terraform owns the image tag.** Every application deploy would be a Terraform apply and an infrastructure approval.
4. **A scheduled automatic teardown.** Not wanted; a manual destroy with a runbook is enough.

## Related

ADR-0007, ADR-0012, ADR-0015, ADR-0018; `WI-DEP-001`; register items 101 and 102; `docs/management/budget-cost-estimate.md`.
