> **Status:** In progress · remaining: infrastructure as code, the deploy stage, the post-deploy smoke, teardown and cost evidence; the images and the Compose `apps` profile are built (see the progress note)

> **Progress note (2026-10-31):** started by the lead's decision (the deployed dev environment and its teardown are the next main work; `current-plan.md`). Built on `feature/dev-environment`: Dockerfiles for the catalog and ordering services (one recipe, `services/Dockerfile.dotnet`), the BFF and the customer web app; a Compose profile `apps` that runs them; `skeleton-smoke.mjs --containers`, which passed 21 of 21 against the containers; a fixed issuer for the mock issuer (`MockOidc:Issuer`), a metadata address override (`Auth:MetadataAddress`) and a development-only switch for a plain-http token endpoint on the Compose network, with 14 new Auth tests; a "Moving to Entra" table in `docs/operations/local-dev.md`. Gap `T-65` (time-zone data): the base image has it. Evidence: `docs/evidence/WI-DEP-001/images-and-compose-2026-10-31.md`. **Design (2026-10-31):** ADR-0020 (Proposed). **Web image (2026-10-31):** the build-time rewrite is replaced by a run-time `/api/graphql` route, so one image serves every environment (spike and result in `docs/evidence/WI-DEP-001/web-runtime-config-spike-2026-10-31.md`). **Not done:** the run-time configuration endpoint for the login addresses (register item 101), everything in Azure (no Terraform for the environment, no `azuread` provider, no deploy stage, no teardown), the first run of the `apps` profile on the Linux pipeline, and the decisions in register items 101 (web image per environment) and 102 (the mock issuer on a public address). ADR-0018 is Accepted (2026-10-31).

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
- [ ] Whether the lead wants this at all (the trigger is the lead's decision).
