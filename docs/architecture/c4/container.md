# Container Diagram

> **Status:** Current · rewritten 2026-10-30 from the code, `docker-compose.yml`, `first-slice-contract.md` and `docs/evidence/slice-1/findings.md`. The first diagram is what runs today, on a developer machine. The second is the target shape from the ADRs, none of it deployed.

The bounded-context-to-service mapping is decided in ADR-0009 (13 contexts onto 4 services, with the modular-monolith rule). The request through these containers, step by step, is in [the request path](../request-path.md).

## 1. What exists and runs locally (slice 1)

Legend: solid boxes are built and exercised by the real-stack journeys (`node scripts/ci/skeleton-smoke.mjs`). Dashed boxes are empty scaffolds or not used yet. Ports are the local defaults.

```mermaid
flowchart LR
    classDef built fill:#e8f1ff,stroke:#2b5fa8,color:#10243f
    classDef scaffold fill:#f6f6f6,stroke:#888,stroke-dasharray: 5 4,color:#444
    classDef infra fill:#eef7ee,stroke:#3f7f3f,color:#13301a

    USER(["Customer<br/>(browser)"])
    PHONE(["Customer<br/>(Android phone)"])

    subgraph WEB["apps/web-customer — Next.js Pages Router, :3000"]
        direction TB
        SSR["Server: renders public listing pages (SSR)<br/>forwards /api/graphql to the BFF"]
        CSR["Browser code: login (PKCE), cart in sessionStorage,<br/>checkout and order pages (client-rendered),<br/>access token held in memory only"]
    end

    subgraph APP["apps/mobile-customer — Expo (React Native), Android only, local only (WI-MOB-001)"]
        MOB["App: login (PKCE, system browser),<br/>refresh token in the Keystore, access token in memory,<br/>plain fetch to the BFF with Authorization: Bearer;<br/>cart and order logic from packages/customer-core"]
    end

    BFF["services/graphql-bff — Node/TypeScript, :4100<br/>GraphQL schema, Relay global ids,<br/>error mapping; no business rules"]

    subgraph SVC["C# services — ASP.NET Core, net10.0"]
        CAT["catalog-service :5200<br/>listings, stock, vendor status<br/>(hosts the Catalog context; Search, Ads and Preferences are planned)"]
        ORD["ordering-service :5300<br/>Order aggregate, checkout, vendor and<br/>customer actions, outbox relay"]
        ADM["admin-service<br/>(empty scaffold)"]
        NOT["notification-service<br/>(empty scaffold)"]
    end

    OIDC["Mock OIDC issuer :5100<br/>PKCE login for users,<br/>client-credentials for services,<br/>signs JWTs, serves JWKS"]

    subgraph STORES["docker-compose.yml infrastructure"]
        COSMOS[("Cosmos DB vNext emulator :8081<br/>containers: catalog (/vendorId),<br/>orders (/customerId)")]
        REDISEV[("Redis Streams :6379<br/>domain events")]
        REDISCACHE[("Redis cache :6380<br/>profile with-redis;<br/>no service uses it yet")]
    end

    subgraph OBS["Tracing (optional compose profiles)"]
        COLL["OpenTelemetry Collector :4327/:4328<br/>profile collector"]
        ASPIRE["Aspire dashboard :18888<br/>profile tracing"]
        JAEGER["Jaeger :16686<br/>profile jaeger"]
    end

    SEED["tools/BakeryMarketplace.Seed<br/>(run by hand or by the smoke script)"]

    PHONE --> MOB
    MOB -->|"login redirect (app scheme), token exchange<br/>and refresh, via adb reverse locally"| OIDC
    MOB -->|"GraphQL, Authorization: Bearer"| BFF
    USER --> SSR
    USER --> CSR
    CSR -->|"login redirect, then token exchange"| OIDC
    CSR -->|"GraphQL via same-origin /api/graphql<br/>Authorization: Bearer"| SSR
    SSR -->|"public queries (no token), SSR"| BFF
    SSR -->|"API route"| BFF
    BFF -->|"REST: listings"| CAT
    BFF -->|"REST: checkout, orders, pickup windows<br/>token forwarded"| ORD
    ORD -->|"REST: listing read, stock reserve and release<br/>service token (client credentials)"| CAT
    ORD -.->|"fetches signing keys"| OIDC
    CAT -.->|"fetches signing keys"| OIDC
    ORD -->|"service token request"| OIDC
    CAT --> COSMOS
    ORD --> COSMOS
    ORD -->|"outbox relay publishes<br/>OrderPlaced, OrderConfirmed, ..."| REDISEV
    CAT -->|"publishes ListingPublished, LowStockDetected;<br/>consumes VendorVerified, VendorSuspended"| REDISEV
    SEED --> COSMOS
    SEED -->|"VendorVerified"| REDISEV
    BFF -.->|"OTLP/HTTP spans"| COLL
    SSR -.-> COLL
    CAT -.-> COLL
    ORD -.-> COLL
    COLL --> ASPIRE
    COLL --> JAEGER

    class SSR,CSR,MOB,BFF,CAT,ORD,OIDC,SEED built
    class ADM,NOT,REDISCACHE scaffold
    class COSMOS,REDISEV,COLL,ASPIRE,JAEGER infra
```

**Reading it**
- **Every service validates the token itself** (zero trust, ADR-0006): the BFF forwards the customer's bearer token unchanged, and `ordering-service` and `catalog-service` each check signature, issuer, audience and role, then ownership. There is no gateway yet, so nothing sits between the BFF and the services.
- **Service callers use their own token.** `ordering-service` calls the catalog's stock endpoints with a client-credentials token whose app role is `Stock.Reserve` (ADR-0018, local phase only).
- **Events leave ordering through an outbox**: they are stored in the same write as the order and published inline, with a relay sweeping any that missed (`WI-ORD-005`). **Nothing consumes the order events yet**, so the queue read-model (`QUE-001`) and notifications have nothing wired.
- **The catalog publishes and consumes events too.** It listens for `VendorVerified` and `VendorSuspended`, which only the seed script publishes today because no admin or onboarding service exists.
- **Tracing is optional.** Services export OTLP only when an endpoint is configured; the three tracing containers are compose profiles. The browser itself is not traced, so a trace begins at the web server or the BFF.
- **Dashed grey boxes:** `admin-service` and `notification-service` contain only `Program.cs`; the cache Redis runs under a profile but no service reads it (the catalog cache-aside, `WI-CAT-003`, is not built).
- **Not drawn because they do not exist:** `web-admin`, `web-queue-display`, API Management, Key Vault, Stripe, any cloud environment.

## 2. Target shape (decided in ADRs, not built, nothing deployed)

This is the shape the ADRs describe for a deployed environment. It differs from the first diagram where noted.

```mermaid
flowchart TB
    classDef planned fill:#fff8e6,stroke:#b07d00,stroke-dasharray: 5 4,color:#3a2a00
    classDef decided fill:#fff8e6,stroke:#b07d00,color:#3a2a00

    subgraph CLIENTS["Browser apps (Next.js, ADR-0012)"]
        WC["web-customer"]
        WA["web-admin"]
        WQ["web-queue-display"]
    end
    MOBILE["mobile-customer<br/>(Expo, Android; ADR-0023;<br/>built locally only, no store build)"]

    BFF["GraphQL BFF<br/>(ADR-0013)<br/>hosting undecided (register 25)"]
    APIM["Azure API Management<br/>Consumption tier (ADR-0008, amended by 0013)<br/>fast-fail JWT check, coarse routing"]

    subgraph SVC["C# services (ADR-0009, ADR-0010)"]
        CAT["catalog-service"]
        ORD["ordering-service"]
        ADM["admin-service<br/>Admin/Moderation, Vendor Onboarding"]
        NOT["notification-service"]
    end

    ENTRA["Microsoft Entra External ID<br/>(ADR-0006 amendment)<br/>users, and app registrations for services (ADR-0018)"]
    EG["Azure Event Grid (ADR-0003)"]
    COSMOS[("Cosmos DB, container per context<br/>(ADR-0004)")]
    REDIS[("Managed Redis cache<br/>(ADR-0002; vendor undecided)")]
    KV["Key Vault + managed identity<br/>(ADR-0007)"]
    STRIPE["Stripe Connect<br/>(ADR-0005)"]
    OBS["OpenTelemetry Collector<br/>then Application Insights (ADR-0016)"]

    WC --> BFF
    WA --> BFF
    WQ --> BFF
    MOBILE --> BFF
    BFF --> APIM
    APIM -->|"validated JWT, coarse routing"| CAT
    APIM --> ORD
    APIM --> ADM
    ORD -->|"stock reserve and release"| CAT
    CAT --> COSMOS
    ORD --> COSMOS
    ADM --> COSMOS
    CAT --> REDIS
    ORD -->|"outbox, then publish"| EG
    CAT --> EG
    ADM --> EG
    EG --> NOT
    EG -->|"order read-model for the queue display (ADR-0004)"| ORD
    ORD --> STRIPE
    CAT --> KV
    ORD --> KV
    ADM --> KV
    NOT --> KV
    BFF -. identity .-> ENTRA
    SVC -. spans .-> OBS

    class WC,WA,WQ,MOBILE,BFF,APIM,CAT,ORD,ADM,NOT,ENTRA,EG,COSMOS,REDIS,KV,STRIPE,OBS planned
```

**Differences from what runs today**
- A real identity provider (Entra External ID) replaces the mock issuer; services get app registrations for service-to-service calls, with the DEV credential type still open (ADR-0018, register 62).
- API Management sits between the BFF and the services; locally the BFF calls the services directly. Every service still validates the token itself.
- Event Grid replaces Redis Streams; Redis Streams stays the local transport (ADR-0003).
- A managed Redis cache is actually used by the catalog (cache-aside, `WI-CAT-003`) and the three cache layers of ADR-0014 are owned.
- Key Vault, Stripe, `web-admin`, `web-queue-display`, and a consumer for the order events (the queue read-model and notifications) all arrive.
- Where the Next.js server and the BFF run is undecided (register item 25).

## Within a service

Co-located contexts (for example Catalog and Preferences inside `catalog-service`) still talk through the same interfaces and events they would use if they were separate services (ADR-0009's modular-monolith rule). These diagrams show service-level boxes only; a component diagram for `ordering-service` and `catalog-service` is planned (the architecture pass).
