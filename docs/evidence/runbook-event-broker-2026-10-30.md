# Runbook test: event broker unavailable during checkout (2026-10-30)

> **Status:** Snapshot · 2026-10-30, `main` at `aa75d79` plus the documentation branch; local stack, nothing deployed. Work item `WI-OPS-002`. **Current result:** with Redis Streams stopped, checkout still accepted and confirmed orders in about 2.1 s each (the 2-second inline publish timeout); when Redis was started again the relay published both orders' events within 6 s, with no duplicates. No operator-visible count of pending events exists (register item 96).

## Environment

Windows 11, Docker Desktop. Compose infrastructure (Redis Streams, the Cosmos emulator, the mock issuer), then catalog-service (`:5200`), ordering-service (`:5300`) and the BFF (`:4100`) run from source with the commands in `docs/operations/local-dev.md` ("Run slice 1", steps 1 to 6), seeded with `tools/BakeryMarketplace.Seed`. Orders were placed through the BFF as `user-customer-1` (a token from the mock issuer by the PKCE exchange), one sourdough loaf from `vendor-shop-001`, a new idempotency key each time.

## Procedure and observations

| Step | Command or action | Observed |
|---|---|---|
| Baseline | place one order | HTTP 200, `CONFIRMED`, 9.0 s (first call on a cold stack). Redis: `events:OrderPlaced` 1, `events:OrderConfirmed` 1 |
| Outage | `docker compose stop redis-events` | stopped |
| Order during the outage, twice | place an order | HTTP 200, `CONFIRMED`, 2125 ms and 2081 ms |
| Service log | read `ordering-service` output | `warn` `Events of order <id> were not published inline; the outbox relay will send them` for each order, and `Event OrderPlaced #1 of order <id> could not be published; it stays pending` |
| Recovery | `docker compose start redis-events` | after 6 s: `events:OrderPlaced` 3, `events:OrderConfirmed` 3 (baseline 1, plus 2) |
| Relay log | read `ordering-service` output | `Outbox relay: 2 order(s) had unpublished events; 2 event(s) published`, then `Outbox relay: 1 order(s) had unpublished events; 2 event(s) published` |
| Duplicates | `XRANGE events:OrderPlaced - +` | 3 entries for 3 orders |
| Visibility | `GET /health`, `GET /metrics` on ordering | `{"status":"Healthy"}`; `/metrics` is 404; no custom metrics in `services/ordering-service/src` |

Stream names were listed with `redis-cli --scan`; lengths with `redis-cli XLEN`.

## What the run did not show

- The second relay log line (`1 order(s) ... 2 event(s) published`) was not analysed; one order with two events would fit, but the run did not check.
- `/health` was not read during the outage, so whether it reflects Redis is unknown.
- A stuck entry (register 74), several instances (72), a long outage, and a restart of ordering-service during the outage were not run.
- Cold start: the 9.0 s first call (a cold stack: issuer metadata, service token, JIT) is consistent with the 9.7 s whole-journey figure in `baseline-2026-10-30.md`.

## Result for the work item

The runbook [`docs/operations/runbooks/event-broker-unavailable-during-checkout.md`](../operations/runbooks/event-broker-unavailable-during-checkout.md) was written from this run. The gap it found is register item 96.
