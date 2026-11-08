# ordering-service

Checkout, pickup scheduling, the order lifecycle, the vendor's view of orders, and publishing order events.

**Status (2026-11-08): built, run locally only.** The `Order` aggregate and its lifecycle (`Pending` to `Completed`, or `Cancelled`), checkout with idempotency and server-side pricing, pickup windows, stock reservation through the catalog (with a sweep that releases the reservation of an order that was never saved), a named payment **stub** (no money moves) that judges a saved payment method's token by ordering's own rule (`WI-ORD-010`), vendor and customer order actions including cancel (`WI-ORD-011`), automatic confirmation of simple orders, and an outbox with a relay that publishes order events to Redis Streams. Ordering also consumes its own events: a vendor read model (`WI-QUE-001`) that serves the vendor's list and a live stream (`WI-QUE-003`, ADR-0021), and the pickup fulfillment strategy as a separate consumer that answers with its own events (`WI-ORD-003`, ADR-0001). The notification service consumes the events too. Not built: a real payment (`PAY-001`) and any deployment. Container images exist (`services/Dockerfile.dotnet`, the Compose `apps` profile) and were run locally only.

## Endpoints

| Method | Path | Who |
|---|---|---|
| POST | `/ordering/checkout` | Customer (needs an `Idempotency-Key` header) |
| GET | `/ordering/orders`, `/ordering/orders/{id}` | The customer: their order list (paged) and one order |
| GET | `/ordering/payment-methods` | The customer's saved payment methods (no token is returned) |
| GET | `/ordering/pickup-windows` | Anonymous |
| POST | `/ordering/orders/{id}/confirm`, `decline`, `start-preparation`, `ready`, `complete` | Vendor who owns the order |
| POST | `/ordering/orders/{id}/cancel` | Customer or vendor, per the lifecycle rules |
| GET | `/ordering/vendor/orders`, `/ordering/vendor/orders/{id}` | The vendor: their orders, from the read model, with listing names |
| GET | `/ordering/vendor/orders/stream` | The vendor: server-sent events of their order changes (limits per vendor and per instance, ADR-0021) |
| GET | `/health` | Anonymous |

Run it, with the rest of the stack: `docs/operations/local-dev.md` ("Run slice 1") or `node scripts/dev/demo.mjs`. Tests: `dotnet test services/ordering-service/tests/OrderingService.Tests` (some tests skip unless Redis and the Cosmos emulator are up; see `CLAUDE.md`). The lifecycle is `docs/architecture/order-lifecycle.md`; the components are in `docs/architecture/c4/component-services.md`; the request path is `docs/architecture/request-path.md`.
