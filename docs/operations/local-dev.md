# Local Development Environment

How to run the local infrastructure from `docker-compose.yml` (`WI-DEV-002`). Application services are **not** containers yet: run them on the host with `dotnet run` against the ports below.

> **Verification status (2026-10-26):** the Compose file's structure, the mock issuer container's host process, and the readiness script were verified. **`docker compose up` itself has not been run**, because the Docker engine was not running on the machine where this was written. The Cosmos emulator image tag and its flags are unverified. See "What is and is not verified".

## Start, check, stop

```
docker compose up -d                        # event backbone + Cosmos emulator + mock OIDC issuer
docker compose --profile with-redis up -d   # additionally the cache Redis (ADR-0002)
node scripts/dev/check-env.mjs --wait 90    # add --with-redis when using the profile
docker compose down                         # data is not persisted
```

Requires Docker and Node 18+. Without the `with-redis` profile, services should use `CACHE_BACKEND=local` (ADR-0002).

## Services and ports

All ports bind to `127.0.0.1` only. The mock issuer signs tokens for anyone who asks and the Redis instances have no password.

| Service | Port (override variable) | ADR | Notes |
|---|---|---|---|
| `redis-events` | 6379 (`REDIS_EVENTS_PORT`) | 0003 | Redis Streams event backbone. Default |
| `cosmos` | 8081 (`COSMOS_PORT`), explorer 1234 (`COSMOS_EXPLORER_PORT`) | 0004 | Cosmos vNext emulator, plain HTTP, partial API coverage (open item #2). Default |
| `mock-oidc` | 5100 (`MOCK_OIDC_PORT`) | 0006 | Built from `tools/BakeryMarketplace.MockOidcHost`. Default. Refuses to start in the Production environment |
| `redis-cache` | 6380 (`REDIS_CACHE_PORT`) | 0002 | Profile `with-redis` only. Separate from `redis-events` so cache eviction can never touch the event streams |

## Environment variables for services run on the host

ASP.NET Core maps `__` to `:` in configuration keys. Template: `infra/local/service.env.example`.

| Variable | Value | Used by |
|---|---|---|
| `Auth__Authority` | `http://localhost:5100` | every service (JWT validation) |
| `Auth__Audience` | `bakery-marketplace` | every service |
| `Events__Backend` | `redis` | catalog-service (default is `inmemory`) |
| `Redis__ConnectionString` | `localhost:6379` | event transport |
| `Data__Backend` | `cosmos` | catalog-service (default is `fake`) |
| `Cosmos__ConnectionString` | `AccountEndpoint=http://localhost:8081/;AccountKey=<the emulator's documented fixed key>` | catalog-service |
| `Cosmos__Database` | `bakery` | catalog-service |

**The authority must be exactly `http://localhost:5100`.** The mock issuer takes its issuer URL from the request's own host, so tokens carry `iss=http://localhost:5100`, and services reject any token whose issuer differs from their configured authority. A service running *inside* a container could not reach the issuer at that URL; this matters when services are containerized.

## What is and is not verified

| Item | State |
|---|---|
| Default set is exactly `redis-events`, `cosmos`, `mock-oidc`; `--profile with-redis` adds `redis-cache`; all ports are loopback-bound | Verified with `docker compose config` |
| Mock issuer host: refuses to start in Production, serves discovery in Development; a real catalog-service validates its tokens through discovery (vendor token → 201, customer → 403, garbage → 401) | Verified, run as host processes (not as the container) |
| Readiness script: reports UP/DOWN per service and exits non-zero when any default service is down | Verified against the live issuer and against missing Redis and Cosmos |
| `docker compose up`, the mock-oidc image build, Redis containers, the Cosmos emulator starting and answering on 8081 | **Not verified** (Docker engine not running) |
| catalog-service against the Cosmos emulator or Redis Streams | **Not verified** |

## Known gaps in this environment

1. **No database or container is created in the emulator.** `catalog-service` expects a `catalog` container with partition key `/vendorId`. Nothing provisions it yet (`WI-DEV-004` or an `EnsureCreated` step in the service; production uses Terraform, `DATA-004`).
2. **The catalog Cosmos client uses default settings.** The emulator over HTTP likely needs gateway connection mode and endpoint limiting on the `CosmosClient`. Unverified until the emulator runs.
3. **Mock users and seed vendors do not line up.** The issuer's vendor user has subject `user-vendor-1`, and ownership requires the token subject to equal the listing's `vendorId`. Seed vendors such as `vendor-shop-001` therefore cannot be edited by any mock user. `WI-DEV-004` must either seed vendors with the mock user's id or the issuer needs matching users.
4. **The mock issuer's login page reflects query parameters unescaped** (`redirect_uri`, `state`, `code_challenge`), so a crafted link injects script into the page. Dev-only and loopback-bound here, but it is a defect in `tools/BakeryMarketplace.Auth/MockOidcIssuer.cs` (`WI-AUTH-005`); fix with HTML encoding.
5. **No Stripe CLI wiring** (`WI-DEV-003`), **no seed data** (`WI-DEV-004`), **no application containers**, and no Next.js, BFF or trace viewer yet; those arrive with `WI-PORT-002`/`005`.
