# Local Development Environment

To show the slice to someone, use the one-command demo: [Demo](demo.md).

> **Status:** Current · "Run slice 1" verified 2026-10-30 by following it step by step in a fresh clone on Windows 11 (Docker Desktop). The rest was verified on 2026-10-26 to 2026-10-28 and is marked below. Nothing here is deployed; application services are not containers, so you run them on the host against the ports below.

## Run slice 1

Slice 1 is a customer logging in, browsing listings with stock, building a cart, placing a test order (the payment is a stub) and watching the order's status. This path starts the whole real stack by hand. To run it all in one command, with teardown, use `node scripts/ci/skeleton-smoke.mjs` instead (it does the same steps and then the Playwright journeys).

**You need:** Docker, the .NET 10 SDK, Node 24 or later (the BFF needs it), git, and a bash-like shell (Git Bash on Windows). First-time downloads (Docker images, NuGet and npm packages) are not counted below.

Run from the repository root. Steps 4 to 7 each keep a process running, so use a terminal each (or `&`).

```
# 1. Create the local secrets (git-ignored .env; prints no values)
node scripts/dev/init-env.mjs

# 2. Infrastructure: Redis Streams, the Cosmos emulator, the mock identity issuer
docker compose up -d --build
node scripts/dev/check-env.mjs --wait 180        # exit 0 when all three are up

# 3. Seed 7 listings and mark both vendors verified
export COSMOS_KEY="$(node -e "console.log(require('fs').readFileSync('scripts/lib/local-stack.mjs','utf8').match(/EMULATOR_KEY =\s*'([^']+)'/)[1])")"   # the emulator's published fixed key
export COSMOS_CS="AccountEndpoint=http://localhost:8081/;AccountKey=${COSMOS_KEY}"
Cosmos__ConnectionString="$COSMOS_CS" dotnet run --project tools/BakeryMarketplace.Seed

# 4. catalog-service on :5200
ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS=http://localhost:5200 Data__Backend=cosmos Events__Backend=redis \
  Redis__ConnectionString=127.0.0.1:6379 Cosmos__ConnectionString="$COSMOS_CS" \
  dotnet run --no-launch-profile --project services/catalog-service/src

# 5. ordering-service on :5300 (calls the catalog as itself, with the secret from step 1)
ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS=http://localhost:5300 Data__Backend=cosmos Events__Backend=redis \
  Redis__ConnectionString=127.0.0.1:6379 Cosmos__ConnectionString="$COSMOS_CS" \
  ServiceAuth__ClientSecret="$(grep '^ORDERING_CLIENT_SECRET=' .env | cut -d= -f2-)" \
  dotnet run --no-launch-profile --project services/ordering-service/src

# 6. GraphQL BFF on :4100
(cd services/graphql-bff && npm ci)
(cd services/graphql-bff && CATALOG_URL=http://localhost:5200 ORDERING_URL=http://localhost:5300 npm start)
#    To run the journeys later (below), start it with ENABLE_TEST_HOOKS=1 as well. That forwards the declined-payment test hook; never set it outside tests.

# 7. Customer web app on :3000 (everything is read at run time, on every request). The login runs on its server (ADR-0019): it needs the cache Redis
#    (`docker compose --profile with-redis up -d`, port 6380) and the encryption key that init-env.mjs wrote to .env as SESSION_ENCRYPTION_KEY.
(cd packages/web-session && npm ci)
(cd apps/web-customer && npm ci)
(cd apps/web-customer && GRAPHQL_URL=http://localhost:4100/graphql npm run build)    # also compiles the Relay artifacts, which are git-ignored
(cd apps/web-customer && GRAPHQL_URL=http://localhost:4100/graphql AUTH_ISSUER=http://localhost:5100 AUTH_CLIENT_ID=web-customer APP_ORIGIN=http://localhost:3000 SESSION_REDIS_URL=redis://127.0.0.1:6380 SESSION_ENCRYPTION_KEY="$SESSION_ENCRYPTION_KEY" npx next start -p 3000)
```

**Check it is up:** `curl localhost:5200/health`, `localhost:5300/health`, `localhost:4100/healthz` and `localhost:3000/` each return 200. Through the BFF:

```
curl -s -X POST localhost:4100/graphql -H 'content-type: application/json' \
  -d '{"query":"{ listings(first: 3) { edges { node { name price { cents currency } stock { status } } } } }"}'
```

**Use it:** open http://localhost:3000, press Log in, choose "Login as Alice Customer (Customer)" (the mock issuer lists its users on its own page), open a listing, add it to the order, go to checkout, optionally pick a pickup time, and press "Place test order". A banner says no payment is taken. A plain order (no option, no pickup time) confirms by itself; one with an option or a pickup time stays "Order received" until a vendor acts. A reload keeps you logged in: the session is on the web app's server behind an HttpOnly cookie (ADR-0019).

**Run the journeys against this stack:** `cd apps/web-customer && GRAPHQL_URL=http://localhost:4100/graphql npm run test:skeleton` (21 tests; they sign in as the mock users and place real orders). Two of them use the declined-payment hook, so the BFF must have been started with `ENABLE_TEST_HOOKS=1` (step 6); that is how it was started for the run recorded below.

**Stop and reset:** stop the four processes, then `docker compose down`. Data is not persisted. Seeding twice changes nothing, so stock used by an earlier run stays used (for example the Almond Croissant sells out in the journeys); `docker compose down` and `up` again resets it.

### What this was run against (2026-10-30)

| Step | Result |
|---|---|
| Fresh `git clone` of the committed tree, steps 1 to 7 as written, with Docker images and package caches already warm | Everything healthy about 91 s after the first command (infrastructure 9 s, seed 15 s, web build about 60 s) |
| `curl` checks and the GraphQL query above | 200 on all four health endpoints; three listings returned with prices in cents and stock status |
| `npm run test:skeleton` against the hand-started stack | 21 passed in 16.8 s; the first journey took 9.1 s (cold issuer fetches, see `patterns.md` section 10) and the rest 0.3 to 1.1 s |
| `npm run build` with `src/__generated__` deleted | Succeeded, so the build step compiles the Relay artifacts itself |

**Not verified:** the first-ever run on a machine with nothing cached (image pulls, NuGet and npm downloads); Linux or macOS hosts; logging in and ordering by hand in a browser (the journeys do it with Playwright); a second run on the same stack.

Other reference below: services and ports, environment variables, tracing, service authentication, ordering-service details, seeding, and the known gaps.

## Start, check, stop

```
docker compose up -d --build                # event backbone + Cosmos emulator + mock OIDC issuer
docker compose --profile with-redis up -d   # additionally the cache Redis (ADR-0002)
node scripts/dev/check-env.mjs --wait 90    # add --with-redis when using the profile
docker compose down                         # data is not persisted
```

Requires Docker and Node 24 or later. Without the `with-redis` profile, services should use `CACHE_BACKEND=local` (ADR-0002). `check-env.mjs` exits 0 when everything is up and 1 otherwise. Between runs, `docker compose down && docker compose up -d` resets all state (the emulator keeps data while its container lives).

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
| `Events__Backend` | `redis` | catalog-service and ordering-service: **no default; each refuses to start without `redis` or `inmemory`** (`appsettings.Development.json` sets `redis`) |
| `Redis__ConnectionString` | `localhost:6379` | event transport |
| `Data__Backend` | `cosmos` | catalog-service (default is `fake`) |
| `Cosmos__ConnectionString` | `AccountEndpoint=http://localhost:8081/;AccountKey=<the emulator's documented fixed key>` | catalog-service |
| `Cosmos__Database` | `bakery` | catalog-service |
| `Cosmos__GatewayMode` | `true` (emulator only) | the emulator only works over the gateway; deployed environments keep direct mode |
| `Cosmos__EnsureCreated` | `true` (local only) | creates the database and `catalog` container (partition key `/vendorId`); deployed environments use Terraform |

**Which addresses a login may return to.** The mock issuer only redirects a browser to a registered `redirect_uri`, compared exactly (no prefix, case or trailing-slash leniency); the defaults are the two web apps' **server-side** callbacks, `http://localhost:3000/api/auth/callback` (customer) and `http://localhost:3100/api/auth/callback` (queue display). Set `MockOidc__RedirectUris__0`, `__1`, ... on the `mock-oidc` service to register others, for example another port. Everything its login page shows is HTML-encoded.

**Browser login.** The web app's **server** exchanges the authorization code at the issuer's `/token` (ADR-0019), so the browser makes no cross-origin call to the issuer and `MockOidc__AllowedOrigins__*` is no longer needed for login (the CORS middleware stays, with its default, for other callers). Refresh tokens: a login that asks for the `offline_access` scope gets one; it is single use and rotated, a second use revokes the whole login, and it expires after `MockOidc__RefreshTokenMinutes` (default 480).

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
| The vendor's live queue (WI-QUE-003): a customer's order, and each action the vendor takes on it, reach the queue display by push (168 ms for the first order; p50 68 ms, p95 99 ms over 20 orders), with the whole stack running (`node scripts/ci/skeleton-smoke.mjs`, 25 of 25; `docs/evidence/WI-QUE-003/real-stack-2026-11-02.md`) | Verified on this machine, host mode |
| A stream ending at a real issuer's token expiry, a service or Redis restarted under a live screen, the queue display as a container, an OTLP collector for the stream metrics | **Not verified** |
| The Cosmos emulator over HTTPS, Linux/macOS hosts, and Docker Desktop on other machines | **Not verified** |
| Emulator persistence across `down`, resource usage under load, startup time on a cold pull | **Not measured** |

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

## Application containers (compose profile `apps`, WI-DEP-001)

The same four application images the cloud dev environment will use can run in Compose, next to the infrastructure:

```
node scripts/dev/init-env.mjs                                  # the ordering client secret; Compose refuses to start `ordering` without it
COMPOSE_PARALLEL_LIMIT=1 docker compose --profile apps up -d --build   # catalog :5200, ordering :5300, graphql-bff :4100, web :3000
dotnet run --project tools/BakeryMarketplace.Seed             # then seed, as for host processes
node scripts/ci/skeleton-smoke.mjs --containers [--keep]      # the whole stack in containers plus the Playwright journeys; tears down unless --keep
docker compose --profile apps down                            # removes them
```

Images: `services/Dockerfile.dotnet` (catalog and ordering; one recipe, build arguments choose the project), `services/graphql-bff/Dockerfile`, `apps/web-customer/Dockerfile` (no build argument: `GRAPHQL_URL` is read at run time by the `/api/graphql` route). They hold no secret: configuration is environment variables (the Cosmos key in the Compose file is the emulator's published key). All four run as a non-root user (checked with `id` in each image). The `apps` services run in the `Development` environment on purpose, because only there do the services accept the plain-http mock issuer.

Two details of the container network. The issuer string in tokens must be one name, but a container reaches the mock issuer as `mock-oidc` and the browser as `localhost`: the mock issuer is given `MockOidc__Issuer=http://localhost:5100`, and the services fetch metadata from `Auth__MetadataAddress=http://mock-oidc:5100/...` while still validating tokens against `Auth__Authority=http://localhost:5100`. And ordering sends its client secret to `http://mock-oidc:5100/token`, which is plain http to a non-loopback host; the library refuses that unless the host opts in, and ordering opts in only when `ASPNETCORE_ENVIRONMENT=Development` (`allowInsecureTokenEndpoint`, never read from configuration).

Verified 2026-10-31 on this machine (Windows, Docker Desktop): the Playwright skeleton suite, 21 of 21, against the four containers (`docs/evidence/WI-DEP-001/images-and-compose-2026-10-31.md`); and on 2026-11-02, 25 of 25 against images rebuilt with the live queue (`docs/evidence/WI-QUE-003/real-stack-2026-11-02.md`; the queue display runs on the host in both). Not verified: the pipeline (Linux agent), a cold start with no layer cache.

## Moving to Entra: what changes

The services contain no mock-specific code, so the move is configuration plus one credential adapter. From ADR-0018, not yet tried against a tenant (its verification list is still open):

| Setting | Mock issuer (now) | Entra External ID (DEV and later) |
|---|---|---|
| `Auth__Authority` | `http://localhost:5100` | the tenant's v2.0 issuer string (format to be confirmed against a real token, verification item 4) |
| `Auth__MetadataAddress` | the container-network address of the mock | unset, or the tenant's metadata URL if it differs from the issuer |
| `Auth__Audience` | `bakery-marketplace` | the catalog API's application ID URI |
| `ASPNETCORE_ENVIRONMENT` | `Development` (accepts plain http) | not `Development`: https metadata is then required |
| `ServiceAuth__TokenEndpoint` | `http://mock-oidc:5100/token` | the tenant's https token endpoint; `allowInsecureTokenEndpoint` is not used |
| `ServiceAuth__Scope` | `bakery-marketplace/.default` | `<application ID URI>/.default` |
| `ServiceAuth__ClientSecret` | generated into `.env` | option C: no secret, a client assertion from the managed identity; option A: a Key Vault reference |
| Roles | the mock client's configured roles | the app role `Stock.Reserve`, assigned to the ordering client (needs the privileged Graph permission, run by the lead) |
| Web login (`AUTH_ISSUER`, `AUTH_CLIENT_ID`, served by `/api/config`) | `http://localhost:5100`, `web-customer` | the tenant's issuer and the web app's client id; Entra's authorize and token paths differ from `<issuer>/authorize` and `/token`, so explicit endpoint settings are needed then (register item 101, resolved) |
| Users | the mock's fixed users | real sign-up and sign-in; the `roles` and `vendorType` claims come from the tenant's configuration (`AUTH-004`) |

As each piece is built, add the row that changes to this table.

## Running ordering-service (WI-ORD-001)

```
node scripts/dev/init-env.mjs                 # once: creates ORDERING_CLIENT_SECRET in .env
docker compose up -d --build                  # includes the mock issuer, which registers the ordering client from that secret
# catalog-service on :5200 as above, then:
ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS=http://localhost:5300 \
  Data__Backend=cosmos Cosmos__ConnectionString="<emulator connection string>" \
  ServiceAuth__ClientSecret="<ORDERING_CLIENT_SECRET from .env>" \
  dotnet run --no-launch-profile --project services/ordering-service/src
```

`appsettings.Development.json` supplies the authority, the catalog URL, the event backend (`redis`, so Redis from compose must be up) and the non-secret service-auth settings; the service stops at startup if the client secret (or any required value) is missing or the token endpoint is not https/loopback. Without `Data__Backend=cosmos` orders are kept in memory. The `orders` container is created locally by `Cosmos__EnsureCreated` (deployed environments use Terraform).

Checkout needs a customer token (log in through the PKCE flow as `user-customer-1`), an `Idempotency-Key` header, and a pickup window from `GET /ordering/pickup-windows?vendorId=...` (anonymous, UTC, never cached): 15-minute slots between 08:00 and 17:00 `America/New_York` (converted to UTC for each date, so they shift an hour with daylight saving), at least 30 minutes ahead. `X-Test-Payment: decline` makes the payment stub decline (ignored in Production). The host needs time-zone data to resolve the zone; the .NET SDK container has it, and no ordering-service container image exists yet (open item 71).

## Seeding

```
export Cosmos__ConnectionString="AccountEndpoint=http://localhost:8081/;AccountKey=<emulator key>"
dotnet run --project tools/BakeryMarketplace.Seed
```

Writes 7 listings (6 Published, 1 Draft negative case) for `vendor-shop-001` and `vendor-indep-001` through `IRepository<T>`, and publishes `VendorVerified` (fixed event id, sequence 1) for both vendors. Ids and prices follow `first-slice-contract.md` §7. Re-running creates nothing and leaves existing listings untouched (including local edits). Refuses non-loopback Cosmos endpoints. `catalog-service` applies the vendor events from the stream whether it starts before or after the seed. Preference profiles are not seeded: no preference model or container exists yet (`WI-PREF-001`).

## Known gaps in this environment

1. **The Cosmos adapter tests do not actually test Cosmos by default** (register item 31, still open on 2026-10-30). `CosmosRepositoryTests` default to `https://localhost:8081`, but this emulator serves HTTP, so the tests cannot connect and silently return early: they report 4/4 passing without touching Cosmos. Pointed at the real emulator (`COSMOS_CONNECTION_STRING=AccountEndpoint=http://localhost:8081/;...`), **3 of 4 fail** with `Document does not contain an id field`, because the test entity serializes as `Id` and Cosmos requires lowercase `id`. The adapter itself works (catalog uses it with explicit property names). Fixing the tests and removing the silent skip is `WI-DATA-003`, which this item unblocks (open item #31).
2. **Mock users and seed vendors (resolved 2026-10-27).** Ownership requires the token subject to equal the listing's `vendorId`. The issuer now also offers `vendor-shop-001` and `vendor-indep-001` as login users (role Vendor), matching the seeded vendors, so each can edit only its own listings. `user-vendor-1` remains but owns no seeded listings.
3. **(Fixed 2026-10-28, `S1-06`; kept for the record.) The mock issuer's login page reflected query parameters unescaped** (`redirect_uri`, `state`, `code_challenge`; confirmed by sending a script payload). Dev-only and loopback-bound here, but it is a defect in `tools/BakeryMarketplace.Auth/MockOidcIssuer.cs` (`WI-AUTH-005`); fix with HTML encoding.
4. **The Redis Streams transport acknowledges messages it cannot deserialize without dead-lettering them** (register item 88; first noted as reconciliation finding B2). Not exercised here.
5. **No Stripe CLI wiring** (no spec; part of `PAY-001`, backlog N-08) and **no application containers** (register item 71). The Next.js app, the BFF and the trace viewer exist and run on the host as described above.
