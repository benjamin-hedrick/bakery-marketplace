# WI-DEP-001: the dev environment stack (written, not applied)

> **Status:** Evidence · written 2026-10-31 on the development machine (Docker Desktop; Terraform 1.13.5 and azurerm 4.x in the pinned `hashicorp/terraform` image). Branch `feature/dev-teardown`. **Nothing here was planned or applied against Azure.**

## What was built

| Piece | Where |
|---|---|
| The environment stack: Log Analytics (daily cap 0.5 GB), Container Apps environment, Key Vault (RBAC, purge protection off), Cosmos account (free tier by variable) with database `bakery` and containers `catalog` (`/vendorId`) and `orders` (`/customerId`), Redis as an internal TCP container app, and four container apps (catalog, ordering, graphql-bff, web) | `infra/environments/dev/` (replaces the old azurerm 3.x placeholder files) |
| A persistent user-assigned identity per environment, with AcrPull on the registry | `infra/foundation/` (`app_identities`), so the destroy guard never meets a role assignment scoped to the foundation group |
| Plan-level tests with mocked providers | `infra/environments/dev/tests/dev.tftest.hcl` (5 runs), one new run in `infra/foundation/tests/` |
| The checks runner covers both stacks by default | `scripts/ci/terraform-checks.mjs` |

## Decisions applied (lead, 2026-10-31)

- **Cosmos key (option A):** Terraform creates the Key Vault secrets `cosmos-connection-string` and `ordering-client-secret` with the placeholder `set-after-apply` and ignores later changes. A step after apply (not built) sets the real values with `az keyvault secret set`, so no secret value is in configuration or state. The apps read them by Key Vault reference.
- **Events Redis:** a container app (`redis-events`), internal ingress, one replica, no persistence. A restart loses the stream; the outbox relay is the recovery path (register item 74 covers its hardening).
- **Later hardening (approved to do later):** managed-identity access to Cosmos in the services (ADR-0007), which removes the Cosmos secret and the post-apply step. Register item 109.

## Result

`node scripts/ci/terraform-checks.mjs` (default roots now `infra/foundation` and `infra/environments/dev`): 7 of 7 steps passed (format, init, validate, mocked-provider tests for both stacks).

## What this does not show (not run)

- Any Azure acceptance of the plan: names, SKUs, the free-tier limit, `exposed_port` on a TCP app, `rbac_authorization_enabled`, the Key Vault reference syntax, the 90-second role wait.
- That `http://catalog` (port 80) resolves to an app whose ingress target port is 5200, and that `redis-events:6379` resolves from the other apps.
- That a placeholder image with a different listening port leaves the apps unhealthy until the application deploy stage replaces it (expected, not observed).
- That the destroy guard accepts a real destroy plan of this stack (register item 107).
- The apps with a real issuer: `auth_authority`, `service_auth_token_endpoint` and `web_auth_issuer` have no default; they depend on register item 102 and `N-02`.
