# Domain-Driven Design Artifacts

> **Status:** Current · updated 2026-11-08 (the built-state column; the artifacts themselves were checked on 2026-10-30)

| File | What it holds | Built or only designed |
|---|---|---|
| `bounded-contexts.md` | The context map: 13 contexts, their classification and integration patterns. ADR-0009 maps them onto 4 services | Catalog, Ordering, Preferences, pickup fulfillment, Notifications and the personalized read of Search are implemented locally; the others are design only (see the status line of the file) |
| `glossary.md` | The ubiquitous language: actors, terms, key domain events, the scoped-out B2B supplier | Language for the whole domain |
| `event-storming.md` | Four process flows (Command, Aggregate, Event, Policy, Read Model) that surfaced four previously unnamed events | A design model: see the built-state table in the order-lifecycle flow |

There is no separate aggregate sketch file. The `Order` aggregate is implemented in `services/ordering-service/src/Domain/Order.cs` and described in `docs/architecture/order-lifecycle.md`; the listing document is in `services/catalog-service`; the data shapes are in `docs/architecture/data-model-api-contracts.md`. Process terms (surprise rule, context completeness) are in `docs/method/glossary.md`, not here.
