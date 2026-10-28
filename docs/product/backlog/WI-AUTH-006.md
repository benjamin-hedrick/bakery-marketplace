> **Progress note (2026-10-28):** phase 1 built on `feature/service-auth`: the mock issuer authenticates registered clients and issues app-only tokens (the unauthenticated `mock_user_id` shortcut is gone); `AddBakeryAuth` accepts several audiences; the `ServiceStockReserve` policy; `ClientCredentialsTokenProvider`, the bearer handler and `AddBakeryServiceAuth` with startup validation; `scripts/dev/init-env.mjs`, Compose and docs. 80 Auth tests pass, mutation checks confirmed the key tests fail when the behavior breaks, and the mock issuer was exercised in its real container (token claims, wrong secret refused, unregistered client refused, secret absent from logs). **Not done:** phase 2 (DEV), the ordering and catalog wiring (no endpoints or catalog client exist yet; `CAT-006` and `ORD-001`), the pipeline step that generates a secret (nothing consumes one yet), and a run on Azure.

```
WI ID:               AUTH-006
Title:                Service-to-service authentication (OAuth2 client credentials)
Type:                 Service Implementation
Epic:                 EPIC-AUTH
Shared with epic(s):  EPIC-CATALOG, EPIC-ORDERING, EPIC-SECRETS
Hat/Owner:            Engineering/Build, Security
Status:               Proposed (added 2026-10-28). Auth logic: needs human approval; the DEV credential type waits on the ADR-0018 verification list
Size:                 L
```

**Context / Why**
`ordering-service` must call `catalog-service`'s stock reserve and release endpoints (ADR-0017, `CAT-006`) as a service. ADR-0018 proposes OAuth2 client credentials with app roles in the `roles` claim. Open item 62.

**Inputs / References**
- *Decisions*: ADR-0018 (the full change list), ADR-0006 (role plus ownership), ADR-0007 (secrets), ADR-0008 (zero trust, no gateway routing for service endpoints)
- *Code*: `tools/BakeryMarketplace.Auth` (`AddBakeryAuth`, `MockOidcIssuer`, `MockUsers`), `tools/BakeryMarketplace.Secrets` (`SecretValidator`), `docker-compose.yml`, `infra/local/service.env.example`

**You do not need to know about**
- Entra External ID tenant setup for end users (`AUTH-004`), except where DEV app registrations touch it

**Out of scope**
- The reserve and release endpoints themselves (`CAT-006`) and the checkout call that uses them (`ORD-001`)
- Mutual TLS; rotating secrets without a restart (ADR-0007)

**Requirements / Acceptance Criteria**
- *Phase 1, local (can be built now):*
  - The mock issuer authenticates registered clients (configured id, secret and granted roles; no secret in source), issues app-only tokens (`client_id`, `idtyp=app`, `roles`, audience from the requested scope, no user claims), and returns `invalid_client` for a bad secret; the unauthenticated `mock_user_id` path is removed and its two tests are rewritten
  - `AddBakeryAuth` accepts several audiences; a `ServiceStockReserve` policy requires the `Stock.Reserve` role and an app-only token
  - A `ClientCredentialsTokenProvider` (cached, single refresh in flight, fails closed, secret or assertion) and a `DelegatingHandler` that attaches the bearer token
  - A script generates random client secrets into the git-ignored `.env`; Compose and `service.env.example` carry the keys; `docs/operations/local-dev.md` documents them; the pipeline generates secrets per run
  - Tests as listed in ADR-0018: accepted and refused combinations, token cache and refresh, startup failure on a missing secret
- *Phase 2, DEV (after the ADR-0018 verification):* app registrations and the `Stock.Reserve` app role, the ordering client with the selected credential (federated identity credential, else a Key Vault secret), the privileged app-role assignment, v2 tokens, a verified issuer string, and a real token from the External ID tenant accepted by catalog
- No secret, token or assertion appears in a log, span, error message or committed file

**Dependencies**
- Blocks: `CAT-006`, the limited-stock path of `ORD-001`
- Phase 2 depends on: `AUTH-004` (Entra External ID tenant), the `azuread` Terraform provider, and approval of the privileged permission

**Definition of Done**
See `docs/process/definition-of-done.md`. Human approval required before merge (auth logic and IAM).

**AI-agent suitability**
Phase 1 yes, once ADR-0018 is accepted. Phase 2 needs the human lead for tenant access and approvals.

**Open Points (working)**
- The DEV credential type (ADR-0018 options A, B, C)
- Whether the client allow-list in catalog is worth having in v1
- Which role and audience names to standardize for future service callers
