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
- Entra mode: `auth_authority`, `service_auth_token_endpoint` and `web_auth_issuer` are only used when `issuer_mode = "entra"` (N-02, not started).

## Addendum (2026-10-31): the mock issuer in the stack

Decision (lead, 2026-10-31): Path M, public and Customer-only by default (register item 102).

| Piece | Where |
|---|---|
| Start-up rule for a deployed mock issuer | `tools/BakeryMarketplace.Auth/MockOidcDeployment.cs`, used by `tools/BakeryMarketplace.MockOidcHost/Program.cs` |
| Role filter on the login page and at submit | `MapMockOidcIssuer(..., allowedRoles)` in `MockOidcIssuer.cs`; null keeps the local behaviour |
| Tests | `tools/tests/BakeryMarketplace.Auth.Tests/MockOidcDeploymentTests.cs` (the rule, the page, a posted Admin or Vendor id refused, an allowed user still logs in, no list = unchanged); Auth tests 163 of 163 passed |
| Terraform | `infra/environments/dev`: the `mock-oidc` container app, `issuer_mode`, `issuer_roles`, `allowed_ips`; derived issuer addresses; `tests/mock_issuer.tftest.hcl` (4 runs); 7 of 7 checks passed |

**What a public visitor can do:** sign in as the Customer user and place orders in the disposable store. They cannot obtain an Admin or Vendor token while `issuer_roles` is Customer only; widening it needs `allowed_ips`.

**Cost exposure (from memory of Azure pricing, not checked):** each app is capped at one replica and scales to zero, Cosmos free tier throttles instead of billing, the Log Analytics workspace has a 0.5 GB daily cap, the Redis app is a fixed few dollars a month. A request flood could add request charges; the budget alert only notifies and teardown is manual. No rate limiting exists (item 27).

**Not verified:** everything in the register item 102 note above: the host in a container behind the ingress, service-to-issuer reachability when `allowed_ips` is set, the ordering secret reaching both apps.

**Run against the built image (local Docker, 2026-10-31, host port 5199, no ingress in front):** Production with no switch: refused at start-up with the message. Production with the switch, an https issuer and a registered redirect: the login page listed only "Alice Customer (Customer)"; a posted `user-admin-1` returned 400; a posted `user-customer-1` returned 302; the start-up log said logins were limited to Customer. Production with the switch and `AllowedRoles__0=Admin` and no restriction flag: refused at start-up. This is not a run behind the Container Apps ingress.
