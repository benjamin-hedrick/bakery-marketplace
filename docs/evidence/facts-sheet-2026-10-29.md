# As-built facts sheet (2026-10-29)

> **Current result (2026-11-08):** a snapshot of 2026-10-29: the counts, the endpoint list and "no application containers" were true that day and are not maintained. Later counts are in the generated test record and `docs/testing.md`; what is built now is in `docs/product/backlog/current-plan.md`.

The ground truth every document claim is checked against in the review pass. Provenance per row: **RUN** = executed in this session; **READ** = read from code, config or a command's listing in this session; **CLAIM** = stated by a document, not verified. Nothing here says a deployed or cloud environment works: none was run.

## Environment of the checks
Windows 11, .NET SDK 10.0.401, Node 25.9.0 (engines in both Node packages: `>=24`), branch `feature/slice-1-doc-reconcile` (tree equal to `origin/main` plus review documents).

## Solutions and projects (READ)
- **Root `BakeryMarketplace.slnx`**: 4 services (`catalog`, `ordering`, `admin`, `notification`), **2 service test projects** (`CatalogService.Tests`, `OrderingService.Tests`), 9 tools projects (`Auth`, `Caching`, `Data`, `Eventing`, `EventSchemas`, `Logging`, `MockOidcHost`, `Seed`, `Secrets`).
- **`tools/BakeryMarketplace.slnx`**: 7 library test projects (`Auth`, `Caching`, `Data`, `EventSchemas`, `Eventing`, `Logging`, `Secrets`) plus the libraries.
- `admin-service` and `notification-service`: one `.cs` file each (`Program.cs`, `/healthz` or `/health` only).
- `ordering-service/src`: 18 `.cs` files; `catalog-service/src`: 13.

## HTTP surface (READ)
| Service | Endpoints |
|---|---|
| catalog | `GET /catalog/listings`, `GET /catalog/listings/{id}` (anonymous); `POST /catalog/listings`, `PUT /catalog/listings/{id}` (Vendor role + ownership); `POST /catalog/listings/{id}/stock/adjust`; `POST /catalog/stock/reservations`, `DELETE /catalog/stock/reservations/{orderId}` (service credential policy `StockReserve`); `GET /health` |
| ordering | `POST /ordering/checkout`, `GET /ordering/orders/{id}` (Customer role); `GET /ordering/pickup-windows`; vendor actions `POST /ordering/orders/{id}/{confirm,decline,start-preparation,ready,complete}` (Vendor role); `POST /ordering/orders/{id}/cancel`; `GET /health` |
| admin, notification | health endpoint only |
| GraphQL BFF (port 4100) | `Query`: `node`, `listings`, `listing`, `pickupWindows`, `order`; `Mutation`: `placeOrder` returning `PlaceOrderSuccess` or `PlaceOrderRejected` (typed codes) |

## Web app (`apps/web-customer`) (READ)
Routes: `/` (listings), `/listings/[id]`, `/checkout`, `/orders/[id]`, `/auth/callback`. `web-admin` and `web-queue-display`: README and an empty `src` only.

## Tests
| Suite | Result | Provenance |
|---|---|---|
| BFF (`npm test`) | **75 passed**, 0 failed | RUN |
| Web unit (`npm run test:unit`) | **53 passed**, 0 failed | RUN |
| `CatalogService.Tests` | **104 passed**, 0 failed, 0 skipped | RUN |
| `OrderingService.Tests` | **337 passed**, 3 skipped, 0 failed (340 total) | RUN |
| Tools test projects (7) | Secrets 5, EventSchemas 16, Logging 3, Eventing 16, Caching 16, Auth 133, Data 25 passed with **15 skipped** (214 passed in all); 0 failed | RUN |
| Web mock-backed browser tests | 57 `test(` lines in `tests/e2e` | READ (count by grep; not run) |
| Real-stack browser suites | 21 `test(` lines in `tests/skeleton`; "21 of 21" reported by `docs/evidence/slice-1/findings.md` | READ / CLAIM (not run in this check: needs Docker stack) |
| Azure pipeline | run `#20261029.4`, build id 18, reported green by the human lead | CLAIM |

## Pipeline, scripts, infrastructure (READ)
- `azure-pipelines.yml` jobs: `dotnet`, `bff`, `web`, `skeleton`.
- `scripts/ci`: `linux-check.mjs`, `redis-touch.mjs`, `skeleton-smoke.mjs`, `summarize-results.mjs`. `scripts/dev`: `check-env.mjs`, `init-env.mjs`.
- `docker-compose.yml` services: `redis-events`, `cosmos`, `mock-oidc` (default); `redis-cache` (`with-redis`); `aspire-dashboard`, `otel-collector`, `jaeger` (profiles). **No application containers.**
- Terraform: one module (`infra/modules/key_vault`) and `dev`, `staging`, `prod` environment folders each with `main.tf` and `variables.tf`. No apply has been run.
- `.github/` does not exist. No `LICENSE`, `SECURITY.md` or `CONTRIBUTING.md`.
- `mkdocs.yml` nav exists; mkdocs is not installed here; the site has not been built.

## Documents (READ)
- 188 tracked Markdown files, 12,396 lines (manifest: `00-manifest.md`). 19 ADR files numbered 0001 to 0018 plus the template file(s). 67 `WI-*.md` specs. Open-items register: 84 numbered items (83 and 84 added 2026-10-29).
- `CorrelationIdMiddleware` never adopts an inbound `X-Correlation-Id` (code comment and logic); `traceparent` is the propagated mechanism (ADR-0016).
- Ordering publishes events through an outbox (`CheckoutService`, `OrderActionService`, `Order`/`OrderSupport` hold outbox types).

## What the repository can and cannot demonstrate today
Can (locally, with Docker): the slice-1 journey run by `node scripts/ci/skeleton-smoke.mjs`; all unit and service test suites above. Cannot: anything deployed; any real Azure Cosmos, managed Redis or Application Insights; a person-operable demo with one command (ledger D-1).

## Tools run
Run without Docker services up (not started in this session). The 15 skipped `Data.Tests` are the Cosmos emulator tests; the Eventing and Caching Redis tests may have used in-memory fakes (finding A8: a green run without Docker does not prove the real adapters). `docs/management/slice-1/01-project-status.md` says "167+ library tests, Auth suite 100" in one row and "Auth 133" in another: the run confirms Auth 133.
