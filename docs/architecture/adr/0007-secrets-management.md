# ADR-0007: Secrets Management

**Status:** Accepted

## Context

Several concerns need real secrets: Stripe's API secret key and webhook signing secret (ADR-0005), Azure Cache for Redis's access key when the managed-Redis path is enabled (ADR-0002 — Basic tier doesn't support Azure AD data-plane auth, so a key is unavoidable there). Other concerns can avoid secrets entirely if designed for it — notably Cosmos DB (ADR-0004), which supports Azure AD RBAC data-plane access instead of connection-string keys. This was flagged as an open gap during ADR-0006 and closed here.

## Decision

**Prefer no secret at all over a well-managed one, wherever the Azure service supports it.** Concretely: Cosmos DB access uses **Azure AD RBAC via each service's managed identity**, not a connection-string key — eliminating a secret rather than just storing it well. This is the first and preferred tier of this ADR's decision, ahead of Key Vault itself.

**Where a secret is unavoidable** (Stripe keys, Redis access key when managed Redis is enabled): **Azure Key Vault**, one vault **per environment** (`dev`, `staging`, `prod` — matching the existing per-environment resource pattern from `tech-stack.md`), so a leak in one environment doesn't expose another.

- Each Container App uses a **system-assigned managed identity**, granted `get`/`list` RBAC on only its own environment's Key Vault — least privilege, no shared credential across environments.
- Secrets are surfaced to app code via **Container Apps' native Key Vault secret references**, injected as environment variables at the platform level. **Application code just reads an environment variable in both local and cloud cases** — there's no `SecretProvider` adapter interface needed the way there is for cache/events/data, because the actual retrieval mechanism lives at the infrastructure layer, not in application code. This is a deliberate simplification, not an oversight — worth naming explicitly since it departs from the adapter pattern used elsewhere.
- **Terraform never writes literal secret values.** It provisions the Key Vault, its access policies, and secret *references* — actual secret values are populated out-of-band (manually, or via a separate secured step) after `terraform apply`, never committed to source control or visible in Terraform plan output. Any Terraform variable that could carry a sensitive value is marked `sensitive = true` regardless.

**CI/CD (GitHub Actions)** already uses OIDC federated login to Azure — no stored long-lived Azure credentials for deployment (`tech-stack.md`). Two separate secret lifecycles are kept explicitly distinct rather than conflated:
- **Deploy-time**: the OIDC federated identity used to deploy, scoped per environment, with no stored secret at all
- **Build/test-time**: Stripe **test-mode** keys needed to run integration tests in CI, stored as GitHub Actions encrypted repository/environment secrets — low risk since these are test-mode keys with no real financial exposure if leaked, but still handled as secrets rather than plaintext config

**Local development**: a git-ignored `.env` file (already covered by the existing `.gitignore` entries) holds Stripe **test-mode** keys and any other local values. No Key Vault dependency locally at all — avoids requiring Azure login just to run `docker-compose up`. This is effectively the "mock" for secrets locally: real test-mode credentials from the actual external providers (Stripe test mode), not a fake secrets store, since the providers themselves already offer safe test credentials.

**Fail-fast validation instead of live chaos.** Unlike cache/event chaos testing, there's no fallback behavior to prove for a missing or malformed secret — the correct behavior is always to refuse to start, not degrade gracefully. Each service validates all required secrets are present and well-formed at startup and fails immediately with a clear error if not, rather than surfacing an obscure failure deep in a request path later. Tests cover this directly: missing secret → fails startup; malformed secret → fails startup.

**Rotation**: Key Vault secret references resolve to "latest" version; picking up a rotated secret requires a service restart in this design (no live in-process rotation). Accepted as a v1 limitation — Key Vault's automatic rotation policies are a reasonable v2 enhancement, named rather than built now.

## Consequences

**Positive**
- Eliminating the Cosmos DB secret entirely (via managed identity + RBAC) is strictly better than managing it well — no credential to leak, rotate, or scope
- Per-environment vaults + least-privilege managed identities keep blast radius contained
- No custom secrets-adapter code needed in application services — Container Apps' native Key Vault integration means the "adapter" is an infrastructure concern, not application code
- Clear separation of CI-time vs. runtime secret lifecycles avoids a common source of confusion (and misconfiguration) in real systems

**Negative / accepted limitations**
- Rotation requires a restart — not ideal for zero-downtime credential rotation, accepted for this scope
- Redis's Basic tier still requires an access-key secret (no AAD data-plane auth available at that tier) — the "eliminate the secret" preference doesn't fully apply there; if this becomes a real concern, a higher Redis tier with AAD auth is the documented upgrade path
- Fail-fast-at-startup for secrets means a bad deploy (missing secret) is a hard outage, not a graceful degradation — a deliberate choice, since "run without your Stripe key" isn't a meaningful degraded mode

## Alternatives considered

1. **Store all secrets, including Cosmos DB access, as Key Vault-managed connection strings.** Rejected where avoidable — managed identity + RBAC is strictly better than a well-managed secret when the service supports it; only used where the target service leaves no alternative (Stripe, Basic-tier Redis).
2. **A single shared Key Vault across all environments.** Rejected — same reasoning as ADR-0004's account-sharing tradeoff, but here the cost of separate vaults is negligible, so there's no reason to accept the shared blast radius the way there was for Cosmos DB's single free-tier account.
3. **A custom `SecretProvider` adapter interface, mirroring ADR-0002/0003/0004.** Considered, rejected — Container Apps' native Key Vault secret references already make application code environment-agnostic (just reads env vars), so a custom abstraction would add complexity without a corresponding benefit.
4. **Live chaos testing for secret access failures** (e.g., simulating Key Vault being unreachable), mirroring cache/event chaos. Rejected — there's no meaningful degraded-but-available mode for "can't get the Stripe key"; fail-fast deterministic tests cover the relevant failure modes without needing a runtime chaos harness.

## Related

- ADR-0002 / ADR-0003 / ADR-0004 — the adapter+chaos pattern this ADR deliberately doesn't use for secret *retrieval*, since the mechanism lives at the infrastructure layer instead
- ADR-0005 — Stripe keys are the primary unavoidable secret this ADR manages
- ADR-0006 — surfaced this gap; JWT validation itself still needs no shared secret (public JWKS only)
- `tech-stack.md` — resolves the previously open secrets-management item
