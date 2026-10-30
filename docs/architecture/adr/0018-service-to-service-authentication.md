# ADR-0018: Service-to-Service Authentication (OAuth2 Client Credentials)

**Status:** Proposed (2026-10-28)

## Context

`ordering-service` must call `catalog-service`'s stock reserve and release endpoints (ADR-0017) as a **service**, not on behalf of a user. ADR-0008 requires catalog to validate the caller itself. Open item 62.

What exists today:

- `AddBakeryAuth` validates one issuer and **one audience** (`Auth:Audience`) and offers role policies over the `roles` claim (`Vendor`, `Admin`, `Customer`). There is no notion of an application caller.
- The mock issuer advertises a `client_credentials` grant, but the implementation **authenticates nobody**: it reads a `mock_user_id` form field and returns a user token, so anyone who can reach port 5100 can mint an Admin token. Two tests rely on it (`MockOidcIssuerTests`, `MockOidcMiddlewareIntegrationTests`). It is a dev stub, not a client-credentials implementation.
- ADR-0007 prefers **no secret** over a well-managed one, keeps secrets in a per-environment Key Vault surfaced as environment variables, forbids Terraform from writing secret values, and wants services to fail fast on a missing secret. `SecretValidator` exists. `infra/` has only a `key_vault` module.
- The cloud identity provider is Microsoft Entra External ID (ADR-0006 amendment); its tenant configuration (`AUTH-004`) is not built.

## Decision (proposed)

1. **OAuth2 client credentials** (RFC 6749 section 4.4). The calling service posts to the issuer's token endpoint, receives a short-lived access token, and sends it as a bearer token. The shared validation middleware validates it like any other token.
2. **Identity and permission model.**
   - The caller is a registered **client** (`ordering-service`), with a `client_id`.
   - Permissions are **app roles in the `roles` claim**, named `<Resource>.<Action>`: `Stock.Reserve` on catalog covers reserve and release. This is how Entra issues app-only tokens (`roles`, not `scp`), and the mock issuer mirrors it.
   - The token request uses `scope=<audience>/.default` (the Entra form); the granted app roles come from the client's registration, not from the request.
   - App-only tokens carry `client_id` (Entra: `azp`/`appid`) and `idtyp=app`, and **no user claims** (`vendorType`, name, email).
3. **Catalog accepts service tokens only on service endpoints**, through a new policy that requires the `Stock.Reserve` role **and** an app-only token. User-facing policies are unchanged, and a user token (which can never carry that role through normal sign-up) is refused on service endpoints. The service endpoints are not part of the public API surface: they are not routed through API Management (ADR-0008), so the token check is the control.
4. **Credential per environment:**

| Environment | Credential | Why |
|---|---|---|
| Local | Client secret generated into the git-ignored `.env`; the mock issuer validates it | ADR-0007 local posture; no Azure login to run Compose |
| DEV, UAT, Prod | Selected from the options below | ADR-0007 prefers no secret |

| DEV option | Secret to hold | Fit |
|---|---|---|
| **A. Client secret in Key Vault**, surfaced to the container as an environment variable | Yes, rotated by restart (ADR-0007) | Simple and well understood; Terraform must not create the value (it would land in state), so it is added out of band |
| **B. Certificate** (`private_key_jwt`) in Key Vault | A private key | Stronger than A, more to operate |
| **C. Federated identity credential**: the service's managed identity gives a signed assertion that the token request presents instead of a secret | None | Matches ADR-0007's preference and keeps secrets out of Terraform state; needs the verification below |

   **Recommendation: C, falling back to A** if the verification fails. The token provider supports both a secret and an assertion, so the choice is configuration plus one credential adapter, not a redesign.

## Required changes

**Mock issuer** (`tools/BakeryMarketplace.Auth/MockOidcIssuer.cs`)
- Registered clients from configuration (`client_id`, secret, granted roles, allowed audience); no secret in source.
- Authenticate the client on `/token` (HTTP Basic or form fields, constant-time comparison); return `invalid_client` otherwise.
- Issue an app-only token: `sub` and `client_id` = the client, `idtyp=app`, `roles` = the client's granted roles, `aud` from the requested scope, no user claims.
- Remove the unauthenticated `mock_user_id` path (or keep user minting only behind a separate dev-only switch) and move its two tests to the new behavior. Advertise `token_endpoint_auth_methods_supported`.

**Shared Auth library**
- `AddBakeryAuth` accepts several valid audiences (`Auth:Audiences`) while still honoring `Auth:Audience`.
- A `ServiceStockReserve` policy (role plus app-only check) and a helper for future service roles; log the calling `client_id`, never the token.
- A `ClientCredentialsTokenProvider` for callers: caches the token until shortly before expiry, one refresh in flight, fails closed (no fallback token), supports a client secret or a client assertion supplier. A `DelegatingHandler` attaches the bearer token to an `HttpClient`.

**catalog-service:** apply the policy to the `CAT-006` endpoints; configure the accepted audience.
**ordering-service:** register the token provider and a typed catalog client with the handler; required configuration validated at startup with `SecretValidator` (token endpoint, client id, scope, and the secret when the secret credential is used).

**Local tooling:** a script generates random client secrets into `.env` (never committed); `docker-compose.yml` passes them to the mock issuer; `infra/local/service.env.example` and `docs/operations/local-dev.md` document the keys. The pipeline generates random secrets per run, so nothing is stored.

**DEV infrastructure (Entra External ID and Azure)**
- App registrations: the catalog API (an application ID URI and the `Stock.Reserve` app role, assignable to applications) and the `ordering-service` client (with option A, B or C).
- The app-role assignment for the ordering client (Microsoft Graph). The identity that applies it needs a privileged permission (`AppRoleAssignment.ReadWrite.All`), which needs human approval.
- Token version 2 for the API (`accessTokenAcceptedVersion=2`), so the issuer matches `https://login.microsoftonline.com/<tenant>/v2.0` (or the External ID host) and the `ValidIssuer` configuration is right.
- Key Vault entries per ADR-0007 for options A or B; for C a federated credential on the client registration. The Terraform `azuread` provider is not yet in the repo.

**Tests:** valid service token accepted; user token refused on service endpoints; service token refused on user endpoints; wrong audience, expired, tampered, missing role, wrong `client_id`; bad client secret refused by the mock issuer; token cache and refresh behavior; startup failure when a required secret is missing.

**Docs:** ADR-0006 and ADR-0007 amendment notes; the local-dev env table; `data-model-api-contracts.md` (catalog service endpoints).

## To verify before final selection

1. Entra External ID tenants support application permissions (app roles), client credentials and federated identity credentials on app registrations, as in a workforce tenant.
2. A managed identity in the Azure subscription's tenant can act as the federated credential for an app registration in the External ID tenant (the cross-tenant case). If not, option A or B applies.
3. Whether plain HTTP to the token endpoint is enough, or `Azure.Identity`/MSAL is worth the dependency for the assertion flow (plain HTTP keeps the mock and Entra on one code path).
4. The `roles` claim, the `azp`/`appid` client id and the issuer format in a real app-only token from the External ID tenant, and whether `idtyp` (an optional claim in Entra, which the service policy requires) has to be switched on for the API registration.

## Consequences

**Positive:** a standard, demonstrable flow; no user token is ever used for service work; one validation path; local and cloud differ by configuration; the secret-free option is available.

**Negative / accepted:** a new auth path to build, test and operate; option A or B adds a secret to rotate; a leaked ordering credential could reserve or release stock (an availability risk, not a data-exposure one), mitigated by the narrow role, idempotent reservations, short token lifetime and a client allow-list; the mock issuer's user-minting shortcut goes away.

## Alternatives considered

1. **Forward the user's token from ordering to catalog.** Rejected: catalog cannot distinguish a user acting from a service acting, ownership checks would apply to the wrong subject, and some calls (releases) happen without a user present.
2. **A static shared API key.** Rejected: a long-lived shared secret with no identity, scope or expiry.
3. **Managed identity only, with no OAuth2 client concept.** Considered: it is secret-free in Azure but gives no local parity and ties the flow to Azure; option C keeps the client-credentials shape while still using the managed identity.
4. **Mutual TLS between services.** Deferred: it needs certificate issuance and rotation infrastructure the project does not have.

## Related

ADR-0006, ADR-0007, ADR-0008, ADR-0017; `WI-AUTH-006`; `WI-CAT-006`; open items 21 (Entra tenant config), 33, 62.

## Progress (2026-10-30)

Status stays Proposed. The direction, OAuth2 client credentials, was chosen by the human lead for demonstration and is settled. Phase 1 (local) is built (`WI-AUTH-006`, `feature/service-auth`, 2026-10-28): the mock issuer's client-credentials grant, the shared client library, and local secret tooling. DEV is not started. The credential type for DEV and later is **not** settled: final selection waits on the verification list above (register item 62).
