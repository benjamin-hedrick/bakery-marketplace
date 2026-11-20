# The first dev apply, 2026-11-20

> **Status:** Current · in progress: the first attempt stopped at the deploy identity's role check before anything was created; the fix is below; the next attempt is recorded here when it has run. Work item: `WI-DEP-001`. Pipeline: `azure-pipelines-dev.yml` on `main`, action `deploy`, plan mode `real`. Identifiers are left out (this repository is public).

## Attempt 1: stopped by the deploy identity's check (nothing created)

The lead ran the pipeline after the apply and teardown stages were merged and the three new pipeline variables were set. `infra_plan` passed; the lead approved at `dev-infra`; in `infra_apply` the step "The deploy identity checks its own roles and that it cannot create (bootstrap check 6)" failed:

```
Signed in as the deploy identity, object id <id>
  Contributor at /subscriptions/<id>/resourcegroups/rg-bakery-dev (condition: false)
  Role Based Access Control Administrator at .../rg-bakery-dev (condition: true)
  AcrPush at .../rg-bakery-foundation/providers/Microsoft.ContainerRegistry/registries/<registry> (condition: false)
  Contributor at .../rg-bakery-foundation (condition: false)
  Role Based Access Control Administrator at .../rg-bakery-foundation (condition: true)
##[error]Identity check: missing: Storage Blob Data Contributor at a scope matching /\/blobServices\/default\/containers\/tfstate$/i
```

The check stopped the stage before the plan and the apply, as designed: nothing was created (`rg-bakery-dev` held 0 resources).

**Cause:** the assignment exists. Listed by the lead's sign-in, the deploy identity holds six assignments, the sixth being Storage Blob Data Contributor on the `tfstate` container. An identity sees only the role assignments at scopes it can read, and the deploy identity has no read right on `rg-bakery-tfstate` (its rights there are data-plane only). The plan identity's own check (build 70) passed because Reader on the subscription lets it see everything. The check assumed an identity can list all of its own assignments; that was not checked when it was written (register 201, item 22).

**Fix:**
- The deploy identity's own check no longer requires its state role (it cannot see it). It still checks every role it can see, and the create probe.
- The plan identity now checks the deploy identity's **complete** role set, in the plan and destroy-plan stages, before any approval (`identity-check.mjs --identity deploy --principal <deploy object id>`). Reading the whole subscription, it sees assignments at every scope, so it also catches a role at a scope the deploy identity cannot read, which the self-check never could.
- Checked from the lead's sign-in (which, like the plan identity, reads every scope): "The deploy identity's roles are exactly the 6 expected." Unit tests cover both views; the structure tests require the new step in both plan stages.

## Attempt 2

Not run yet.
