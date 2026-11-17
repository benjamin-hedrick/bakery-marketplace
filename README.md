# Bakery/Coffee Marketplace — a reference project

[![Build status of main](https://dev.azure.com/benjaminhedrick/benjaminhedrick/_apis/build/status%2Fbenjamin-hedrick.bakery-marketplace?branchName=main)](https://dev.azure.com/benjaminhedrick/benjaminhedrick/_build/latest?definitionId=1&branchName=main)

A pickup-based marketplace that connects customers with local bakeries, coffee shops and home bakers. I built it to practise and experiment with architecture, product and delivery work, and with building software alongside an AI coding assistant.

- **What it is:** a customer website and an Android app, a live order queue for the bakery, and C# services behind a GraphQL BFF, with dietary safety (allergens carried from the listing to the bakery's order card) as a first-class rule.
- **What to look at:** the [architecture decisions](docs/architecture/adr/README.md), the [testing](docs/testing.md) (including faults injected on purpose across the whole stack), and the [AI collaboration record](docs/method/ai-collaboration.md): how the work was controlled, what went wrong and what caught it.
- **Its limits:** it runs on a developer machine; nothing is deployed, the payment is a stub, and the Terraform for Azure is written and validated but has never been applied.

https://github.com/user-attachments/assets/3b9bf265-8c7d-4db8-b5cb-cfb05929a66b

**The demo film** (under two minutes): a web customer with a tree-nut allergy, a phone customer with dairy and tree-nut allergies and the bakery's live order queue, with other customers ordering at the same time. A local demo, test payments. [The file in the repository](docs/operations/demo/demo-film.mp4) · [how it was made](docs/operations/demo-film.md).

**Built with:** C# on .NET 10 (ASP.NET Core) · a Node and TypeScript GraphQL BFF · Next.js (Pages Router), React and Relay · Expo and React Native (Android) · Cosmos DB (the emulator) · Redis Streams · OpenTelemetry · xUnit, Node's test runner, Playwright and Maestro · Terraform · Azure Pipelines · Docker Compose.

## How it fits together

```mermaid
flowchart LR
    WEB["Customer website<br/>Next.js + Relay"]
    PHONE["Android app<br/>Expo"]
    QUEUE["Bakery's live queue<br/>Next.js, server-sent events"]
    BFF["GraphQL BFF<br/>Node / TypeScript<br/>composition and error mapping only"]
    CAT["catalog-service<br/>listings, stock, tags,<br/>allergen profiles"]
    ORD["ordering-service<br/>orders, checkout, outbox,<br/>vendor read model"]
    NOT["notification-service"]
    COSMOS[("Cosmos DB")]
    STREAMS[("Redis Streams<br/>domain events")]
    OIDC["Identity issuer<br/>(local mock, PKCE)"]

    WEB --> BFF
    PHONE --> BFF
    QUEUE --> BFF
    BFF --> CAT
    BFF --> ORD
    ORD -->|reserve and release stock| CAT
    CAT --> COSMOS
    ORD --> COSMOS
    ORD -->|order events| STREAMS
    CAT -->|listing events| STREAMS
    STREAMS --> NOT
    STREAMS --> ORD
    WEB -.->|sign-in| OIDC
    PHONE -.->|sign-in| OIDC
    QUEUE -.->|sign-in| OIDC
```

The C# services own every business rule, price and order state; the BFF only composes and maps. Every service validates the caller's token and ownership itself. The full picture, with ports and the optional containers, is the [container diagram](docs/architecture/c4/container.md); [one request through it](docs/architecture/request-path.md) follows a checkout end to end.

## What this demonstrates

| Capability | What you will find | Start here |
|---|---|---|
| **Architecture and decisions** | Architecture decision records, amended by dated notes and never rewritten; C4 diagrams, a domain model and event storming; the patterns used (adapters with contract tests, the outbox, idempotent checkout, reserve and release, a cache with invalidation, push with polling) with what each is tested against and what happens when a dependency fails | [ADRs](docs/architecture/adr/README.md) · [how they changed](docs/architecture/decision-timeline.md) · [patterns](docs/architecture/patterns.md) · [container diagram](docs/architecture/c4/container.md) · [one request through it](docs/architecture/request-path.md) |
| **Testing** | A layered strategy; contract tests every adapter passes; seeded chaos scenarios that inject faults at the interfaces and are run on the whole stack; a browser flake baseline; mutation checks; real-stack journeys; mobile flows on an emulator; cross-browser runs; test counts and line coverage from one command | [Testing: design, execution and coverage](docs/testing.md) · [chaos scenarios](chaos/README.md) |
| **AI collaboration** | A way of working with controls (approval gates, a clean agent, mutation checks, results reported as passed, failed, skipped or not run); the errors the assistant made and which control caught each; what the sessions cost, relative to each other; the lessons learned | [AI collaboration](docs/method/ai-collaboration.md) · [lessons](docs/method/lessons.md) · [`CLAUDE.md`](CLAUDE.md) |
| **Performance, scalability and NFRs** | Targets traced to decisions and to free-tier ceilings; a soak of the live vendor queue with a service restart; latency before and after the listing cache; resilience under injected failures | [Performance, scalability and NFRs](docs/performance-and-nfrs.md) · [NFRs](docs/architecture/nfrs.md) |
| **Security** | A threat model; zero-trust validation in every service; server-side browser sessions; rate limits; generated-input tests; an OWASP ZAP scan with no high finding; dependency audit and SBOMs; a review statement | [threat model](docs/architecture/threat-model.md) · [review statement](docs/governance/review-statement.md) · [security policy](SECURITY.md) · [evidence](docs/evidence/WI-SEC-005/load-soak-2026-11-03.md) |
| **Delivery and project management** | A roadmap and OKRs; specifications with generated status and traceability; definitions of ready and done; trunk-based themed branches; a risk register; a register of findings, each with a status | [Delivery and project management](docs/delivery.md) · [roadmap](docs/product/roadmap.md) · [current plan](docs/product/backlog/current-plan.md) |
| **Product thinking** | A vision, personas and jobs to be done, a scope with what exists today, dietary safety as a first-class principle with allergens carried from the listing to the vendor's order card | [vision](docs/product/vision.md) · [scope](docs/product/scope.md) · [OKRs](docs/product/okrs.md) |
| **Frontend and mobile** | Next.js with a GraphQL BFF and Relay; a live vendor queue over server-sent events; an Expo Android app with PKCE sign-in; accessibility scans | [web customer](apps/web-customer/README.md) · [queue display](apps/web-queue-display/README.md) · [Android app](apps/mobile-customer/README.md) |

The full map of the documents is [docs/index.md](docs/index.md).

## Run it

The whole system runs on a developer machine. Nothing is deployed, and the payment is a stub: no money moves.

### System requirements

- **Docker** (running), the **.NET 10 SDK**, **Node 24 or later** (developed on 25.9), **git**, and a bash-like shell (Git Bash on Windows). Windows 11 is the platform it is developed and tested on; the pipeline runs on Ubuntu.
- **For the browser tests:** `npx playwright install chromium` once.
- **For the Android app:** JDK 17, the Android SDK, an emulator image named `bakery_pixel`, and Maestro (only for the flows). The first build takes about ten minutes ([app README](apps/mobile-customer/README.md)).
- **Memory:** the full stack with a browser or an emulator is heavy. Close other applications and run one heavy job at a time.
- **Once:** `npm ci` in each Node project you run: the shared packages first (`packages/chaos`, `packages/customer-core`, `packages/web-session`), then `services/graphql-bff`, `apps/web-customer`, `apps/web-queue-display`, and `apps/mobile-customer` for the phone.

### To run the local website and the vendor's queue, with seeded data

```
node scripts/dev/demo.mjs
```

It creates the local secrets, starts Redis, the Cosmos emulator and the mock identity issuer in Docker, seeds the catalog, customers and vendors, starts the catalog, ordering and BFF services, builds and starts the customer app (port 3000) and the vendor's live queue (port 3100), prints a guide and waits. Log in as a seeded customer (for example "Alice Customer") on the first and as "Corner Bakery (owner)" on the second, place an order and watch it move. Enter or Ctrl+C tears it all down. Details and a checklist: [demo](docs/operations/demo.md); the same steps by hand: [local development](docs/operations/local-dev.md).

### To run the local mobile app and the vendor's queue, with seeded data

```
node scripts/dev/mobile-demo.mjs
```

It boots the emulator, starts the same stack, builds and installs the Android app and opens the vendor's queue beside it. Sign in as a seeded customer with allergens (for example Max) and place an order on the phone; accept it on the queue screen. `--no-build` reuses an installed app.

### To run the tests

```
dotnet test tools/BakeryMarketplace.slnx               # the shared libraries (contract tests)
dotnet test services/ordering-service/tests/OrderingService.Tests   # and the catalog and notification services
npm test                                               # in services/graphql-bff, packages/*, apps/mobile-customer
npm run test:unit                                      # in apps/web-queue-display
node scripts/ci/skeleton-smoke.mjs                     # the real stack plus the browser journeys
node scripts/dev/mobile-flows.mjs                      # the Android flows on the emulator
node scripts/ci/test-report.mjs                        # every suite once: counts, skips and line coverage
node scripts/ci/node-gates.mjs                         # the gates to run before every push
```

The Redis and Cosmos tests skip unless the containers are up and named: `docker compose up -d`, then set `REDIS_CONNECTION_STRING=127.0.0.1:6379` and `COSMOS_CONNECTION_STRING` to the emulator's address and published key ([local development](docs/operations/local-dev.md) shows how to read it). The test report says which mode it ran in. What each layer proves is in [Testing](docs/testing.md).

### Everything else

Every script and command is indexed in [scripts](docs/operations/scripts.md): the Docker profiles, the chaos scenarios, the film scripts, the latency, load and security runs, the documentation generators.

## What is in the repository

```
docs/            product, architecture (ADRs, C4, DDD, contracts), process, operations, governance
                 (the open-items register), management, evidence, method, history
services/        catalog-service, ordering-service, notification-service (built, run locally);
                 graphql-bff (Node/TypeScript, the single API entry point for the web apps and the
                 Android app); admin-service (a placeholder for a later phase: a stub, no features)
apps/            web-customer and web-queue-display (Next.js), mobile-customer (Expo, Android);
                 web-admin (a placeholder for a later phase: no code yet)
packages/        customer-core (cart, checkout and allergen logic shared by web and Android),
                 web-session (server-side browser sessions), chaos (fault injection for the Node tiers)
tools/           shared C# libraries with their tests: Auth (JWT, ownership, a mock OIDC issuer), Caching,
                 Chaos, Data, Eventing, EventSchemas, Logging, Secrets, Seed
chaos/           the chaos scenario files and how to run them
infra/           Terraform (a foundation stack and a dev-environment stack, validated locally, never
                 applied), OpenTelemetry collector configuration, local service environments
scripts/         dev, ci and docs scripts: the demos, the film, the real-stack and chaos smokes, the gates
                 and the generators for status, traceability and test reports
docker-compose.yml   local infrastructure: Redis Streams, the Cosmos emulator, the mock issuer, optional
                     tracing and application containers
azure-pipelines.yml  the build and test pipeline; azure-pipelines-dev.yml is the dev-environment pipeline
```

## How the work is organised

Work is specified in **work items** (`docs/product/backlog/`), each with a status on line 1 from which [STATUS.md](docs/product/backlog/STATUS.md) is generated; **decisions** are ADRs that are amended with dated notes and never rewritten; anything found and not fixed goes into the **[open-items register](docs/governance/open-items-register.md)** in the same change; and every run leaves an **evidence record** with its commit, its command and what it does not show ([evidence](docs/evidence/README.md)). The vocabulary, templates and lifecycles are in [docs/method](docs/method/README.md), and the working agreements, risks and plans are in [Delivery and project management](docs/delivery.md).

Much of the code and documentation was written with an AI coding assistant under my direction and review; [`CLAUDE.md`](CLAUDE.md) holds the rules it works to, and [AI collaboration](docs/method/ai-collaboration.md) records how that has gone, including what went wrong. Records written during the work call me "the lead".

The code and documents are released under the MIT licence ([`LICENSE`](LICENSE)). A documentation site configuration exists (`mkdocs.yml`, MkDocs Material); the site is not published.
