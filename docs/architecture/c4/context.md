# System Context Diagram

Actors interact with the platform as a single system boundary; the platform integrates with two external systems for identity and payments.

```mermaid
graph TB
    subgraph Actors
        CUST[Customer]
        SHOP[Shop]
        VEND[Independent Vendor]
        ADMIN[Admin / Moderator]
    end

    SYS[["Bakery/Coffee Marketplace Platform"]]

    subgraph External Systems
        STRIPE["Stripe Connect<br/>(Payments & Payouts — ADR-0005)"]
        B2C["Azure AD B2C<br/>(Identity Provider — ADR-0006)"]
    end

    CUST -->|"Browses, customizes, orders, manages dietary preferences"| SYS
    SHOP -->|"Manages listings, fulfills orders"| SYS
    VEND -->|"Manages listings, fulfills orders"| SYS
    ADMIN -->|"Verifies vendors, moderates listings"| SYS

    SYS -->|"Commission-split charges, vendor payouts"| STRIPE
    SYS -->|"Authenticates all actors, issues JWTs"| B2C
```

**Notes**
- Actors match the glossary (`docs/architecture/ddd/glossary.md`) exactly — no invented actors.
- A Courier actor is deliberately absent — delivery/dispatch is a designed-for, not-built, v2 extension (ADR-0001).
- The email/SMS transport underlying Notification dispatch is intentionally not shown as an external system here — it was never decided which provider (if any) handles this, so showing one would be an invented dependency. See `docs/product/backlog/PARKING-LOT.md`.
