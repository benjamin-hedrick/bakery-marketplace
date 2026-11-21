# The first full dev deploy runs, 2026-11-20

> **Status:** Current · two runs of the full deploy pipeline (`azure-pipelines-dev.yml`, action `deploy`, plan mode `real`), both stopped in the infrastructure apply; the stack was then torn down and the group checked empty. The application images, the post-apply secret step, the application deploy and the smoke tests have still not run in Azure. Work item: `WI-DEP-001`. Times are UTC (the runs were on the lead's evening of 2026-11-20). Identifiers are left out (this repository is public).

## Run 1: the apply step stopped with no message (nothing created)

The plan stage planned 27 to create, and the lead approved at `dev-infra`. The apply step then stopped with exit 1 and no message straight after the foundation `init`. The cause, the fix and the rule are in register 201 (30): the setup script read the environment from an environment variable that Azure DevOps also sets in a deployment job. Nothing was created. The fix was merged before run 2.

## Run 2: the Container Apps environment never finished creating

The plan stage passed, the lead approved, the deploy identity's own check passed, and the re-plan matched the approved plan. From the activity log of `rg-bakery-dev` (read afterwards from the lead's sign-in; every write by the deploy identity):

- 03:23 to 03:26: the Key Vault, the Log Analytics workspace, the budget, the Cosmos account with its database and five containers, and the two Key Vault role assignments were created, each in under two minutes.
- 03:24:33: Azure accepted the create of the Container Apps environment `cae-bakery-dev`.
- About 30 minutes later Terraform stopped: `creating Managed Environment ... polling after CreateOrUpdate: context deadline exceeded` (the provider's default 30-minute create limit). The state lock was released.

Afterwards (read from the lead's sign-in, no value printed):

- **The state:** 17 managed resources, none tainted: everything above, the three placeholder secrets, the wait after the role assignments and the budget's start date. The environment was not in it, nor any app (they need the environment, so none was sent to Azure).
- **Azure:** the environment existed, with the resource's provisioning state `Succeeded` but its own `properties.provisioningState` still `Waiting`, at 04:14 and again at 04:41 (77 minutes after the create was accepted). It had the `Consumption` workload profile and a default domain, but no static IP.
- **Azure Service Health** for the subscription listed no event for the period.
- **Not explained:** the deploy identity went on reading the environment about every 15 seconds until at least 04:11, after the apply step had ended.

**Cause: not known.** Nothing in the stack's code or roles failed. The same environment definition was created without trouble in attempt 2 of the first apply (`first-dev-apply-2026-11-20.md`). East US had already refused a new Cosmos account for this subscription for "high demand" (same file), so regional capacity is a guess, not a finding.

**What it left:** a resource in Azure but not in the state. The next apply would fail because the name is taken, and a teardown cannot see the resource (register 227).

## The teardown

The lead ran the teardown. The destroy plan was 17 to destroy, which is everything in the state. The lead approved, and the destroy ran. Its emptiness check then asked 20 times over 10 minutes and failed, correctly: `Resources are left in rg-bakery-dev after the destroy: Microsoft.App/managedEnvironments cae-bakery-dev`.

Checked afterwards from the lead's sign-in:

- `rg-bakery-dev` held only the environment, still `Waiting`.
- The foundation group (the registry and the apps identity) and the state account were untouched.
- The dev state was unlocked and held 0 managed resources.
- The Key Vault was soft-deleted, with a scheduled purge on 2026-11-28. The rebuild had reused its name without error, while the vault from the first teardown was still soft-deleted.

On the lead's approval, the agent deleted the environment (`az containerapp env delete`, accepted at 04:42:44). It showed `ScheduledForDelete` until 05:06 and was gone at 05:07. `rg-bakery-dev` then held 0 resources.

## Changed after these runs

- The environment's create limit is now 45 minutes (`infra/environments/dev/main.tf`). That allows a slow create, and Terraform still stops on its own, releasing the lock, inside the apply job's 60-minute limit. It does not help an environment that never finishes; register 227 lists what would.
- The teardown runbook names this leftover and how to remove it (`docs/operations/runbooks/dev-environment-teardown.md`).
