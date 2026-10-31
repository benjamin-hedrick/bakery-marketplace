# WI-DEP-001: container images and the Compose `apps` profile

> **Status:** Evidence · run 2026-10-31 on the development machine (Windows 11, Docker Desktop 29.1.3, .NET SDK 10, Node 25.9.0 on the host). Base commit `85c6728` plus the uncommitted work of the `feature/dev-environment` branch (the commit that adds this file is the one to check out). Not run on the Ubuntu pipeline agent.

## What was run

| Check | Command | Result |
|---|---|---|
| Four images build | `docker build` for `services/Dockerfile.dotnet` (ordering, catalog), `services/graphql-bff/Dockerfile`, `apps/web-customer/Dockerfile` | Passed. Sizes after the last build: ordering 385 MB, catalog 385 MB, BFF 338 MB, web 948 MB (1.27 GB before `npm prune --omit=dev`) |
| Whole stack in containers, real journeys | `COMPOSE_PARALLEL_LIMIT=1 node scripts/ci/skeleton-smoke.mjs --containers` | Passed, 21 of 21 Playwright tests (issuer hardening 3, journeys 6, login 2, stack 5, walking skeleton 5), run twice (once before and once after removing the tzdata step and pruning the web image) |
| Auth library tests | `dotnet test tools/tests/BakeryMarketplace.Auth.Tests` | Passed, 147 (133 before this work: 14 new, covering the fixed issuer, the metadata address and the token-endpoint opt-in) |
| Non-root | `id` inside each image | ordering and catalog uid 1654 (`app`), BFF and web uid 1000 (`node`) |
| Time-zone data (gap T-65) | `ls /usr/share/zoneinfo/America/New_York` in the plain `aspnet:10.0` base image | Present, so no `tzdata` install is needed; the ordering container starts with the `America/New_York` pickup schedule |

## What went wrong on the way

- The ordering container exited at start-up: `ServiceAuth:TokenEndpoint must use https unless it is a loopback address.` The library refuses to send a client secret over plain http to a non-loopback host; on the Compose network the issuer is `http://mock-oidc:5100`. Fix: a host-only opt-in, `allowInsecureTokenEndpoint`, set by ordering only in the Development environment and never read from configuration, with tests. This is auth code: it needs the lead's review in the pull request.
- The mock issuer took the issuer string from the request host, so a token fetched from `mock-oidc:5100` and one issued to the browser at `localhost:5100` would have had different issuers. Fix: `MockOidc__Issuer` fixes the issuer string, and `Auth__MetadataAddress` lets the services fetch metadata from the container name while validating against the fixed issuer.
- The first compose build failed with a containerd snapshot error (register item 103); the later runs used `COMPOSE_PARALLEL_LIMIT=1`.

## Not shown by this record

- A Linux agent run (`linux-check.mjs` covers the .NET tests, not the images); a cold-cache build time; image scanning; anything in the cloud.
- The client secret and the Cosmos key are not in the images or in this record. The Cosmos key in `docker-compose.yml` is the emulator's published key.
