# Bakery/Coffee Marketplace — Portfolio Project

A pickup-based marketplace connecting customers with local bakeries and coffee shops and with independent or homemade vendors, built to show architecture, product and engineering ownership on a single project: from decisions and domain model to running, tested code.

> **Status (2026-10-30):** the first slice runs on a developer machine. A customer logs in, browses listings with stock, builds a cart, places a test order (the payment is a **stub**: no money moves) and watches the order's status. **Nothing is deployed.** `admin-service` and `notification-service` are empty scaffolds, `web-admin` and `web-queue-display` are empty, and search, preferences, vendor onboarding, notifications, reviews and real payments are not built. What works and what does not is listed in [scope](docs/product/scope.md); the status of every work item is in [STATUS.md](docs/product/backlog/STATUS.md).

## Read it in this order

1. [Vision](docs/product/vision.md): the problem and the principles
2. [Scope](docs/product/scope.md): what is in v1, what is deferred, and what exists today
3. [Architecture decisions](docs/architecture/adr/README.md) (18 ADRs, by concern) and [how they changed](docs/architecture/decision-timeline.md)
4. [Container diagram](docs/architecture/c4/container.md) (what runs, and the target shape) and [one request through it](docs/architecture/request-path.md)
5. [Patterns](docs/architecture/patterns.md): adapters with contract tests, the outbox, idempotent checkout, reserve and release, and what happens when a dependency fails
6. [Evidence](docs/evidence/slice-1/findings.md): what was run, with a trace through a checkout, a privacy scan of what is exported, and a [test baseline](docs/evidence/baseline-2026-10-30.md)
7. [Roadmap](docs/product/roadmap.md) and the [current plan](docs/product/backlog/current-plan.md)

The full map of the documents is [docs/index.md](docs/index.md).

## Run it

You need Docker, the .NET 10 SDK, Node 24 or later and git. The steps are in [local development](docs/operations/local-dev.md#run-slice-1) ("Run slice 1", verified in a fresh clone on 2026-10-30). For a one-command run that starts everything, runs the browser journeys and tears down: `node scripts/ci/skeleton-smoke.mjs`.

Test commands (from `CLAUDE.md`): `dotnet build BakeryMarketplace.slnx`, `dotnet test tools/BakeryMarketplace.slnx`, the service test projects under `services/*/tests`, `npm test` in `services/graphql-bff`, and `npm run test:unit` in `apps/web-customer`. A green run without Docker does not prove the Redis and Cosmos adapters work: some of those tests fall back to fakes (register items 31 and 35).

## What is in the repository

```
docs/            product, architecture (ADRs, C4, DDD, contracts), process, operations,
                 governance (the open-items register), management, evidence, method, history
services/        catalog-service, ordering-service (built); admin-service, notification-service (scaffolds);
                 graphql-bff (Node/TypeScript, the browser's single API entry point)
apps/            web-customer (Next.js, built); web-admin, web-queue-display (empty)
tools/           shared C# libraries with their tests: Auth (JWT, ownership, a mock OIDC issuer), Caching,
                 Data, Eventing, EventSchemas, Logging, Secrets, Seed
infra/           Terraform (a Key Vault module only), the OpenTelemetry collector configs, local service env
scripts/         dev, ci and docs scripts (environment check, the real-stack smoke, the status generator)
docker-compose.yml   local infrastructure: Redis Streams, the Cosmos emulator, the mock issuer, optional tracing
azure-pipelines.yml  build and test pipeline (no deployment stage)
```

## How the work is organised

Work items are specs in `docs/product/backlog/` with a status on line 1; `docs/product/backlog/STATUS.md` is generated from them. Decisions are ADRs that are amended with dated notes and never rewritten. Anything found and not fixed goes in the [open-items register](docs/governance/open-items-register.md). The vocabulary, templates and lifecycles are in [docs/method](docs/method/README.md). Much of the code and documentation was written with an AI coding assistant under human direction and review; `CLAUDE.md` holds the rules it works to.

A documentation site configuration exists (`mkdocs.yml`, MkDocs Material) but the site is not published. There is no licence file yet, so no reuse rights are granted.
