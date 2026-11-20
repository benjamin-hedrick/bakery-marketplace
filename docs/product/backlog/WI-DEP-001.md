> **Status:** In progress · remaining: infrastructure as code, the deploy stage, the post-deploy smoke, teardown and cost evidence; the images and the Compose `apps` profile are built (see the progress note)

> **Progress note (2026-10-31):** started by the lead's decision (the deployed dev environment and its teardown are the next main work; `current-plan.md`). Built on `feature/dev-environment`: Dockerfiles for the catalog and ordering services (one recipe, `services/Dockerfile.dotnet`), the BFF and the customer web app; a Compose profile `apps` that runs them; `skeleton-smoke.mjs --containers`, which passed 21 of 21 against the containers; a fixed issuer for the mock issuer (`MockOidc:Issuer`), a metadata address override (`Auth:MetadataAddress`) and a development-only switch for a plain-http token endpoint on the Compose network, with 14 new Auth tests; a "Moving to Entra" table in `docs/operations/local-dev.md`. Gap `T-65` (time-zone data): the base image has it. Evidence: `docs/evidence/WI-DEP-001/images-and-compose-2026-10-31.md`. **Design (2026-10-31):** ADR-0020 (Proposed). **Web image (2026-10-31):** the build-time rewrite is replaced by a run-time `/api/graphql` route, so one image serves every environment (spike and result in `docs/evidence/WI-DEP-001/web-runtime-config-spike-2026-10-31.md`). The login settings are served at run time by `GET /api/config` (`AUTH_ISSUER`, `AUTH_CLIENT_ID`), so the web image has no environment-specific value in it (register item 101, resolved). **Foundation and gates (2026-10-31):** `infra/foundation` (registry, role assignments, budget alert) with mocked-provider tests and a `terraform` job in the pull-request pipeline; a destroy guard with tests; `azure-pipelines-dev.yml`, a rehearsal pipeline for proving the environment gates; draft procedures for the bootstrap and for the gate proof (`docs/evidence/WI-DEP-001/terraform-foundation-and-gate-rehearsal-2026-10-31.md`). ADR-0020 is Accepted and register item 106 is decided (2026-10-31). **Environment stack (2026-10-31):** `infra/environments/dev` (Container Apps, an internal Redis app, Cosmos, Key Vault with placeholder secrets set after apply, Log Analytics) and a persistent apps identity in the foundation stack; 7 of 7 local Terraform checks pass; evidence `docs/evidence/WI-DEP-001/environment-stack-2026-10-31.md`; register items 108 (IAM approval needed before any apply) and 109 (managed identity for Cosmos, later). **Not done:** everything in Azure (no `azuread` provider, no deploy stage, no post-apply secret step, no teardown stage), the first run of the `apps` profile on the Linux pipeline, and the decisions in register items 101 (web image per environment) and 102 (the mock issuer on a public address). ADR-0018 is Accepted (2026-10-31).

> **Progress note (2026-11-19 to 2026-11-20):** the lead restarted the deployment by the pipeline route. **Bootstrap (2026-11-19):** the state account, `rg-bakery-dev` and the two pipeline identities with their roles (`docs/evidence/WI-DEP-001/bootstrap-2026-11-19.md`). **Foundation and first plan (2026-11-20):** the foundation stack applied from the lead's machine on the lead's approval (6 resources, including the budget alert); the deploy identity's Contributor and constrained role-assignment right on `rg-bakery-foundation`; the dev pipeline's plan step made real (the read-only identity, `-lock=false`, its own role check, a value-free plan summary in place of the saved plan, `scripts/ci/plan-summary.mjs`), run locally as the lead first and then in Azure DevOps (build 70, on `main`): bootstrap check 6 passed for `bakery-plan` and the plan showed 24 to create (`docs/evidence/WI-DEP-001/foundation-apply-and-first-plan-2026-11-20.md`). The register 214 work (where secrets and private values live, write-only Key Vault placeholders) is on `feature/secrets-boundaries`. Registers 213 (updated), 214 (secrets in state and saved plans) and 215 (anonymous badge access). **Ready to apply and tear down (2026-11-20, `feature/dev-apply-prep`):** the costs of the dev environment as built and a budget alert on its group; the real apply stage (re-plan under the lock, refused unless it is the approved plan; register 110); the real teardown with the guard on a real plan and an emptiness check (`docs/operations/runbooks/dev-environment-teardown.md`); a reusable identity check; no Key Vault purge on destroy (register 108); Azure DevOps token refresh for long applies (`docs/evidence/WI-DEP-001/apply-and-teardown-prep-2026-11-20.md`). **Not done:** a dev apply or teardown run, images, the post-apply secret step, the app deploy and the smoke. **First apply and teardown (2026-11-20):** the dev infrastructure applied on the third attempt, 26 resources, no drift (`docs/evidence/WI-DEP-001/first-dev-apply-2026-11-20.md`), and was torn down on the second (`first-dev-teardown-2026-11-20.md`): the guard's false refusal of the Key Vault secrets fixed (register 107, resolved), all 26 destroyed, the emptiness check's false failure fixed with a retry not yet run on Azure. **Images (2026-11-20, `feature/dev-app-deploy`):** the dev pipeline builds the five images the dev stack runs in an `images` stage with no service connection, beside the plan, and publishes them as an artifact; the approved application deploy pushes them as `bakery-deploy`, after checking they are the built ones, and publishes the record of their digests (`scripts/ci/dev-images.mjs`; the lead chose build first, push after approval). Not yet run in Azure. **Still not done:** the post-apply secret step, the app update and the smoke.

```
WI ID:               DEP-001
Title:                Deployment path: images, deploy stage, dev environment, post-deploy smoke
Type:                 Document/Artifact
Epic:                 EPIC-CLOUD-INFRA
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               In progress
Size:                 L
```

> Created 2026-10-30 to track gaps found by the October 2026 documentation review so that the analysis is not repeated. Captured, not scheduled: no commitment, no delegation plan. The detail of each gap is in the gap catalog rows named below; this spec is the handle that shows it in `STATUS.md`.

**Context / Why**
Nothing is deployed. The path: a hosting decision for the web app and BFF, container images and a deploy stage for the four runtimes (with a time-zone data check), a Terraform dev environment with apply and destroy scripts and a cost guard, a post-deploy smoke running the journey against the deployed URL, a promotion checklist, and a public demo with teardown and a spending limit. Existing items cover parts: register 25 (hosting), 62 (credential), 71 (images), backlog N-02 and N-10.

**Inputs / References**
- *Gap catalog rows*: `T-60`, `T-61`, `T-62`, `T-64`, `T-65`, `G-C10`. See `docs/product/backlog/gap-catalog/` (the "Required content" and "Source" columns carry the detail).
- *References*: ADR-0013, ADR-0015, ADR-0018
- *References*: `docs/architecture/tech-stack.md`
- *References*: `docs/management/budget-cost-estimate.md`

**You do not need to know about**
- Anything outside the rows named above.

**Out of scope**
- Scheduling and delegation; any other gap.

**Requirements / Acceptance Criteria**
- Every row named above has State Done (or Dropped, with the reason) in the gap catalog, pointing at what was produced.
- Anything found while doing it and not fixed is recorded in the register in the same change.

**Dependencies**
- Blocked by: none.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Partial; identity and IAM changes need the lead's approval.

**Open Points (working)**
- [x] Whether the lead wants this at all (the trigger is the lead's decision). **Resolved:** the lead picked it up; see the banner for what is done and what remains.
