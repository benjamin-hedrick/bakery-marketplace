# Local Development Environment

How to run the local infrastructure from `docker-compose.yml` (`WI-DEV-002`). Application services are **not** containers yet: run them on the host with `dotnet run` against the ports below.

> **Verification status (2026-10-26):** `docker compose up` was run and verified on Docker Desktop (Windows), including the `with-redis` profile. A real `catalog-service` ran against the real Cosmos emulator, Redis Streams and the mock issuer container end to end. See "What is and is not verified".

## Start, check, stop

```
docker compose up -d --build                # event backbone + Cosmos emulator + mock OIDC issuer
docker compose --profile with-redis up -d   # additionally the cache Redis (ADR-0002)
node scripts/dev/check-env.mjs --wait 90    # add --with-redis when using the profile
docker compose down                         # data is not persisted
```

Requires Docker and Node 18+. Without the `with-redis` profile, services should use `CACHE_BACKEND=local` (ADR-0002). `check-env.mjs` exits 0 when everything is up and 1 otherwise. Between runs, `docker compose down && docker compose up -d` resets all state (the emulator keeps data while its container lives).

## Services and ports

All ports bind to `127.0.0.1` only. The mock issuer signs tokens for anyone who asks and the Redis instances have no password.

| Service | Port (override variable) | ADR | Notes |
|---|---|---|---|
| `redis-events` | 6379 (`REDIS_EVENTS_PORT`) | 0003 | Redis Streams event backbone. Default |
| `cosmos` | 8081 (`COSMOS_PORT`), explorer 1234 (`COSMOS_EXPLORER_PORT`) | 0004 | Cosmos vNext emulator, image pinned to `vnext-EN20261019`, plain HTTP, partial API coverage (open item #2). Default |
| `mock-oidc` | 5100 (`MOCK_OIDC_PORT`) | 0006 | Built from `tools/BakeryMarketplace.MockOidcHost`. Default. Refuses to start in the Production environment |
| `redis-cache` | 6380 (`REDIS_CACHE_PORT`) | 0002 | Profile `with-redis` only. Separate from `redis-events` so cache eviction can never touch the event streams |

## Environment variables for services run on the host

ASP.NET Core maps `__` to `:` in configuration keys. Template: `infra/local/service.env.example`. In Development, `catalog-service` already enables `Auth:Authority`, `Cosmos:EnsureCreated` and `Cosmos:GatewayMode` from `appsettings.Development.json`, so only the backend selectors and connection strings below are needed.

| Variable | Value | Used by |
|---|---|---|
| `Auth__Authority` | `http://localhost:5100` | every service (JWT validation) |
| `Auth__Audience` | `bakery-marketplace` | every service |
| `Events__Backend` | `redis` | catalog-service (default is `inmemory`) |
| `Redis__ConnectionString` | `localhost:6379` | event transport |
| `Data__Backend` | `cosmos` | catalog-service (default is `fake`) |
| `Cosmos__ConnectionString` | `AccountEndpoint=http://localhost:8081/;AccountKey=<the emulator's documented fixed key>` | catalog-service |
| `Cosmos__Database` | `bakery` | catalog-service |
| `Cosmos__GatewayMode` | `true` (emulator only) | the emulator only works over the gateway; deployed environments keep direct mode |
| `Cosmos__EnsureCreated` | `true` (local only) | creates the database and `catalog` container (partition key `/vendorId`); deployed environments use Terraform |

**The authority must be exactly `http://localhost:5100`.** The mock issuer takes its issuer URL from the request's own host, so tokens carry `iss=http://localhost:5100`, and services reject any token whose issuer differs from their configured authority. A service running *inside* a container could not reach the issuer at that URL; this matters when services are containerized.

**The Cosmos SDK must be 3.63.x or newer.** The shared `BakeryMarketplace.Data` library was on 3.38.1, which throws `IndexOutOfRangeException` while decoding any whole-document query (`SELECT *`, and therefore every LINQ query through `CosmosRepository`) from this emulator; 3.50.0 fails differently; 3.63.0 and 3.63.2 pass. Point reads, writes, projections and `COUNT` work on every version. The library is now on 3.63.2.

## What is and is not verified

| Item | State |
|---|---|
| Default set is exactly `redis-events`, `cosmos`, `mock-oidc`; `--profile with-redis` adds `redis-cache`; all ports are loopback-bound | Verified (`docker compose config` and `docker compose ps`) |
| `docker compose up`: mock-oidc image builds and runs; Redis (events and cache) healthy; Cosmos emulator reaches readiness | Verified |
| Readiness script: UP/DOWN per service, exit 0 when up and 1 when down, no crash (fixed a Windows `process.exit()` crash found here) | Verified over repeated runs in both states |
| Mock issuer container: serves discovery; tokens it issues are accepted by a real catalog-service (vendor → 201, customer → 403, garbage → 401) | Verified |
| catalog-service against the real Cosmos emulator and real Redis Streams: draft create, publish gate (409), `VendorVerified` delivered via a Redis stream, publish, public read from Cosmos, `ListingPublished` on the stream | Verified, one clean pass from a fresh stack |
| The emulator's documented fixed account key works | Verified (authenticated operations succeeded) |
| The Cosmos emulator over HTTPS, Linux/macOS hosts, and Docker Desktop on other machines | **Not verified** |
| Emulator persistence across `down`, resource usage under load, startup time on a cold pull | **Not measured** |

## Run the walking skeleton (WI-PORT-002)

Four processes on the host after `docker compose up` and the seed below. From the repo root (the emulator key is the documented public one):

```
export Cosmos__ConnectionString="AccountEndpoint=http://localhost:8081/;AccountKey=<emulator key>"
dotnet run --project tools/BakeryMarketplace.Seed
ASPNETCORE_ENVIRONMENT=Development Data__Backend=cosmos Events__Backend=redis ASPNETCORE_URLS=http://localhost:5200 \
  dotnet run --project services/catalog-service/src                                  # terminal 1
(cd services/graphql-bff && npm ci && CATALOG_URL=http://localhost:5200 npm start)   # terminal 2, port 4100
(cd apps/web-customer && npm ci && GRAPHQL_URL=http://localhost:4100/graphql npm run build \
  && GRAPHQL_URL=http://localhost:4100/graphql npx next start -p 3000)                 # terminal 3
(cd apps/web-customer && npm run test:skeleton)                                        # Playwright smoke
```

`GRAPHQL_URL` is read at build time (the `/api/graphql` rewrite) and at run time (SSR), so set it for both. Trace ids appear in the BFF's JSON log and in catalog-service's console log in Development (`TraceId:` in the scope). Evidence: `docs/evidence/WI-PORT-002/`.

## Viewing traces (WI-PORT-005)

Locally the trace viewer is the .NET Aspire dashboard (ADR-0016 amendment 2026-10-28; UAT/Prod are planned for Jaeger, not built). It is opt-in:

```
docker compose --profile tracing up -d aspire-dashboard   # UI http://localhost:18888, OTLP/HTTP :4318, OTLP/gRPC :4317
export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
# then start catalog-service and the BFF from the same shell (commands above); the BFF reads the endpoint too
```

Through the collector instead (the shape DEV/UAT/Prod will use; also drops `url.query`):

```
docker compose --profile tracing --profile collector up -d aspire-dashboard otel-collector
export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4328 OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
# plus Jaeger (UI http://localhost:16686): OTEL_COLLECTOR_CONFIG=local-jaeger.yaml docker compose --profile tracing --profile collector --profile jaeger up -d aspire-dashboard otel-collector jaeger
```

Services export only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Traces are kept in memory and lost when the dashboard restarts. The dashboard has no password locally, so it is bound to 127.0.0.1.
The Next.js server exports a client span for its call to the BFF (also given `OTEL_EXPORTER_OTLP_ENDPOINT`), so a page load shows web-customer → graphql-bff → catalog-service. Gaps: the BFF exports one span per successful GraphQL request (not for 400/404); the page render itself has no span; no log export, traces only.

## Service-to-service authentication (ADR-0018, WI-AUTH-006)

A service that calls another service (ordering to catalog's stock endpoints) uses the OAuth2 client credentials grant against the mock issuer. The mock issuer registers a client only when it has a secret, and it never has one in source:

```
node scripts/dev/init-env.mjs        # creates ORDERING_CLIENT_SECRET in the git-ignored .env (kept if it already exists; --rotate replaces it)
docker compose up -d --build mock-oidc
```

The token request authenticates the client (form fields or HTTP Basic), asks for `scope=bakery-marketplace/.default`, and gets an app-only token: `sub` and `client_id` are the client, `idtyp=app`, `roles` holds the granted app roles (`Stock.Reserve` for `ordering-service`), and there are no user claims. A wrong secret gets `invalid_client`. The old `mock_user_id` shortcut, which handed out user tokens without authentication, no longer exists; log in through the PKCE flow for a user token.

The calling service reads `ServiceAuth__TokenEndpoint`, `ServiceAuth__ClientId`, `ServiceAuth__Scope` and `ServiceAuth__ClientSecret` (see `infra/local/service.env.example`) and stops at startup if one is missing. Nothing in the repository holds a secret; the pipeline generates its own per run when a job needs one. DEV uses a different credential (ADR-0018, phase 2).

## Seeding

```
export Cosmos__ConnectionString="AccountEndpoint=http://localhost:8081/;AccountKey=<emulator key>"
dotnet run --project tools/BakeryMarketplace.Seed
```

Writes 7 listings (6 Published, 1 Draft negative case) for `vendor-shop-001` and `vendor-indep-001` through `IRepository<T>`, and publishes `VendorVerified` (fixed event id, sequence 1) for both vendors. Ids and prices follow `first-slice-contract.md` §7. Re-running creates nothing and leaves existing listings untouched (including local edits). Refuses non-loopback Cosmos endpoints. `catalog-service` applies the vendor events from the stream whether it starts before or after the seed. Preference profiles are not seeded: no preference model or container exists yet (`WI-PREF-001`).

## Known gaps in this environment

1. **The Cosmos adapter tests do not actually test Cosmos by default.** `CosmosRepositoryTests` default to `https://localhost:8081`, but this emulator serves HTTP, so the tests cannot connect and silently return early: they report 4/4 passing without touching Cosmos. Pointed at the real emulator (`COSMOS_CONNECTION_STRING=AccountEndpoint=http://localhost:8081/;...`), **3 of 4 fail** with `Document does not contain an id field`, because the test entity serializes as `Id` and Cosmos requires lowercase `id`. The adapter itself works (catalog uses it with explicit property names). Fixing the tests and removing the silent skip is `WI-DATA-003`, which this item unblocks (open item #31).
2. **Mock users and seed vendors (resolved 2026-10-27).** Ownership requires the token subject to equal the listing's `vendorId`. The issuer now also offers `vendor-shop-001` and `vendor-indep-001` as login users (role Vendor), matching the seeded vendors, so each can edit only its own listings. `user-vendor-1` remains but owns no seeded listings.
3. **The mock issuer's login page reflects query parameters unescaped** (`redirect_uri`, `state`, `code_challenge`; confirmed by sending a script payload). Dev-only and loopback-bound here, but it is a defect in `tools/BakeryMarketplace.Auth/MockOidcIssuer.cs` (`WI-AUTH-005`); fix with HTML encoding.
4. **The Redis Streams transport acknowledges messages it cannot deserialize without dead-lettering them** (reconciliation finding B2, still open). Not exercised here.
5. **No Stripe CLI wiring** (`WI-DEV-003`), **no application containers**, and no Next.js, BFF or trace viewer yet; those arrive with `WI-PORT-002`/`005`.
