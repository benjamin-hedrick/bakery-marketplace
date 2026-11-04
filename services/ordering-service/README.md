# ordering-service

Checkout, pickup scheduling, the order lifecycle, and publishing order events.

**Status (2026-10-30): built, run locally only.** The `Order` aggregate and its lifecycle (`Pending` to `Completed`, or `Cancelled`), checkout with idempotency and server-side pricing, pickup windows, stock reservation through the catalog, a named payment **stub** (no money moves), vendor and customer order actions, automatic confirmation of simple orders, and an outbox with a relay that publishes order events to Redis Streams. Not built: `PickupFulfillment` (`WI-ORD-003`), a real payment (`PAY-001`), a consumer for the published events, a container image.

## Endpoints

| Method | Path                                                                                 | Who                                          |
| ------ | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| POST   | `/ordering/checkout`                                                                 | Customer (needs an `Idempotency-Key` header) |
| GET    | `/ordering/orders/{id}`                                                              | The order's customer                         |
| GET    | `/ordering/pickup-windows`                                                           | Anonymous                                    |
| POST   | `/ordering/orders/{id}/confirm`, `decline`, `start-preparation`, `ready`, `complete` | Vendor who owns the order                    |
| POST   | `/ordering/orders/{id}/cancel`                                                       | Customer or vendor, per the lifecycle rules  |
| GET    | `/health`                                                                            | Anonymous                                    |

Run it, with the rest of the stack: `docs/operations/local-dev.md` ("Run slice 1"). Tests: `dotnet test services/ordering-service/tests/OrderingService.Tests`. The lifecycle is `docs/architecture/order-lifecycle.md`; the components are in `docs/architecture/c4/component-services.md`; the request path is `docs/architecture/request-path.md`.
