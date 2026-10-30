# Component diagrams: ordering-service and catalog-service

> **Status:** Current · written 2026-10-30 from the source folders `services/ordering-service/src` and `services/catalog-service/src`. Components are the main classes and folders, not every file. Both services run locally only. Containers around them are in [the container diagram](container.md).

The other two services (`admin-service`, `notification-service`) contain only `Program.cs`, so there is nothing to draw.

## ordering-service

```mermaid
flowchart TB
    classDef api fill:#e8f1ff,stroke:#2b5fa8,color:#10243f
    classDef app fill:#f3ecff,stroke:#6b46a8,color:#241040
    classDef domain fill:#fff4d6,stroke:#b07d00,color:#3a2a00
    classDef infra fill:#eef7ee,stroke:#3f7f3f,color:#13301a
    classDef shared fill:#f6f6f6,stroke:#888,color:#333
    classDef stub fill:#fff,stroke:#c0392b,stroke-dasharray: 5 4,color:#7a1f14

    BFF(["GraphQL BFF"])
    CAT(["catalog-service"])
    ISS(["OIDC issuer"])

    subgraph API["Api (Minimal API endpoints)"]
        CE["CheckoutEndpoints<br/>POST /ordering/checkout<br/>GET /ordering/orders/{id}"]
        PW["PickupWindowEndpoints<br/>GET /ordering/pickup-windows"]
        OA["OrderActionEndpoints<br/>confirm, decline, start-preparation,<br/>ready, complete, cancel"]
    end

    subgraph APP["Application"]
        CS["CheckoutService<br/>idempotency, pricing flow,<br/>reserve, pay, store, publish"]
        PR["CheckoutPricing<br/>integer cents, options, limits"]
        PS["PickupSchedule<br/>15-minute slots, lead time,<br/>zone and daylight saving"]
        AC["AutoConfirmPolicy"]
        OAS["OrderActionService<br/>actor from the token,<br/>transition, save, release stock"]
    end

    subgraph DOM["Domain"]
        ORD["Order aggregate<br/>statuses, transitions, cancel table,<br/>raises events as data"]
        OL["OrderLine, OrderEvent,<br/>event type names"]
    end

    subgraph INF["Infrastructure"]
        GW["CatalogGateway (ICatalogGateway)<br/>listing reads, stock reserve and release,<br/>service token"]
        PAY["IPaymentProcessor<br/>StubPaymentProcessor"]
        ST["OrderStore<br/>create-only write, TryUpdate (ETag),<br/>vendor lookup across partitions"]
        PUB["OrderEventPublisher"]
        RLY["OutboxRelay (hosted service)<br/>sweeps pending events"]
    end

    subgraph SH["Shared libraries (tools/)"]
        AUTH["BakeryMarketplace.Auth<br/>JWT validation, role and ownership policies"]
        DATA["BakeryMarketplace.Data<br/>IRepository, Cosmos"]
        EVT["BakeryMarketplace.Eventing<br/>IEventPublisher, Redis Streams"]
        LOG["BakeryMarketplace.Logging<br/>trace id, telemetry"]
    end

    BFF --> CE
    BFF --> PW
    BFF --> OA
    ISS -.-> AUTH
    CE --> AUTH
    OA --> AUTH
    CE --> CS
    PW --> PS
    OA --> OAS
    CS --> PR
    CS --> PS
    CS --> AC
    CS --> GW
    CS --> PAY
    CS --> ORD
    CS --> ST
    CS --> PUB
    OAS --> ORD
    OAS --> ST
    OAS --> GW
    OAS --> PUB
    ORD --> OL
    GW --> CAT
    GW -.->|"service token"| ISS
    ST --> DATA
    PUB --> ST
    PUB --> EVT
    RLY --> ST
    RLY --> PUB

    class CE,PW,OA api
    class CS,PR,PS,AC,OAS app
    class ORD,OL domain
    class GW,ST,PUB,RLY infra
    class AUTH,DATA,EVT,LOG shared
    class PAY stub
```

**Reading it**
- **The aggregate raises events as data and never publishes.** The application layer stores them with the order in one write; `OrderEventPublisher` then publishes inline and `OutboxRelay` retries anything missed. Later transitions go through `OrderStore.TryUpdateAsync` and then `PublishPendingAsync`, never directly to the transport.
- **Authorization is not in the aggregate.** The endpoints and the action service decide who may call what from the token (role and ownership); the aggregate only knows the actor of a cancellation.
- **Dashed red:** the payment processor is a named stub that approves everything and logs a warning each time.
- `ICatalogGateway` is the seam to the catalog; ordering never reads the catalog's data store.

## catalog-service

```mermaid
flowchart TB
    classDef api fill:#e8f1ff,stroke:#2b5fa8,color:#10243f
    classDef app fill:#f3ecff,stroke:#6b46a8,color:#241040
    classDef domain fill:#fff4d6,stroke:#b07d00,color:#3a2a00
    classDef infra fill:#eef7ee,stroke:#3f7f3f,color:#13301a
    classDef shared fill:#f6f6f6,stroke:#888,color:#333

    BFF(["GraphQL BFF"])
    ORD(["ordering-service"])
    SEED(["Seed script, vendors"])
    REDIS[("Redis Streams")]

    subgraph API["Api (Minimal API endpoints)"]
        LE["ListingEndpoints<br/>public reads, vendor create, edit,<br/>stock set and adjust"]
        SE["StockReservationEndpoints<br/>reserve and release<br/>(service credential policy)"]
        LV["ListingValidator, ListingDtos"]
    end

    subgraph APP["Application"]
        LS["ListingService<br/>CRUD, publish gate, stock status words"]
        SRS["StockReservationService<br/>atomic reserve and release,<br/>idempotent per order id"]
        SEP["StockEventPublisher<br/>ListingPublished, LowStockDetected"]
        VES["VendorEventSubscriptions<br/>VendorVerified, VendorSuspended"]
    end

    subgraph DOM["Domain"]
        LD["ListingDocument<br/>ETagged, stock fields"]
        SP["StockPolicy<br/>limits, low and out thresholds"]
        SRD["StockReservationDocument"]
        VS["VendorStatusStore<br/>one document per vendor,<br/>reserved partition"]
    end

    subgraph SH["Shared libraries (tools/)"]
        AUTH["BakeryMarketplace.Auth<br/>JWT, role, ownership,<br/>ServiceStockReserve policy"]
        DATA["BakeryMarketplace.Data<br/>IRepository, IBatchFactory, Cosmos"]
        EVT["BakeryMarketplace.Eventing<br/>Redis Streams"]
        LOG["BakeryMarketplace.Logging"]
    end

    BFF --> LE
    ORD --> SE
    LE --> AUTH
    SE --> AUTH
    LE --> LV
    LE --> LS
    SE --> SRS
    LS --> LD
    LS --> SP
    LS --> VS
    LS --> DATA
    LS --> SEP
    SRS --> LD
    SRS --> SRD
    SRS --> SP
    SRS --> DATA
    SRS --> SEP
    SEP --> EVT
    SEED --> REDIS
    REDIS --> EVT
    EVT --> VES
    VES --> VS
    VS --> DATA

    class LE,SE,LV api
    class LS,SRS,SEP,VES app
    class LD,SP,SRD,VS domain
    class AUTH,DATA,EVT,LOG shared
```

**Reading it**
- **One Cosmos container, `catalog`, partitioned by `vendorId`,** holds listings, the per-vendor status documents (a reserved partition) and the reservation records, so one transactional batch can cover a listing and its reservation (ADR-0017). That sharing is why register item 66 exists.
- **The publish gate:** a listing reaches `Published` only if its vendor's tracked status is `Verified`; that status is set only from `VendorVerified` and `VendorSuspended` events, never from a client flag. Today only the seed script publishes them.
- **Public reads probe one partition per verified vendor** (register 28).
- **Missing:** no cache-aside (`WI-CAT-003`) and no outbox: events are published after the save, and a failed publish is logged and not re-sent (register 30).
