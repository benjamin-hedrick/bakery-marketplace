# Runbook: event broker unavailable during checkout

> **Status:** Current · written and tested 2026-10-30 on the local stack (nothing is deployed); the run is recorded in [`docs/evidence/runbook-event-broker-2026-10-30.md`](../../evidence/runbook-event-broker-2026-10-30.md). Template: [`template.md`](template.md). Decision: ADR-0003. Pattern: [`patterns.md`](../../architecture/patterns.md) section 3.

The event broker is Redis Streams (`redis-events`). `ordering-service` stores each order and its events in one write, tries to publish inline for at most 2 seconds, and leaves what is unsent to a background relay.

## Symptom

Checkout takes about 2 seconds (the inline publish timeout; a warm checkout without the outage took tens of milliseconds in earlier measurements), and `ordering-service` logs `Events of order <id> were not published inline; the outbox relay will send them`. Orders are still accepted and confirmed. Downstream consumers (there are none built yet) would see no new events.

## How it is detected

What exists today, on the local stack:

- The `ordering-service` log line above (level `warn`), and `Event <type> #<n> of order <id> could not be published; it stays pending`.
- Redis itself: `docker compose ps redis-events` shows it stopped, or `docker exec <redis-events container> redis-cli ping` does not answer.
- When it recovers, the relay logs `Outbox relay: <n> order(s) had unpublished events; <m> event(s) published`.

What does not exist: a metric or health signal for the number of pending events. `/health` answers `Healthy` and there is no `/metrics` endpoint (register item 96). The number of events waiting cannot be read from the service; compare the stream lengths in Redis with the orders placed.

## Customer impact

None that a customer sees beyond the slower checkout: the order is stored, confirmed and readable. Events that other services would act on (notifications, the vendor view) are late until Redis is back.

## Steps

1. Confirm the cause: `docker compose ps redis-events`. If it is stopped or unhealthy, go on.
2. Do not touch `ordering-service` or the order data.
3. Start the broker: `docker compose start redis-events` (or `docker compose up -d redis-events`). Wait for it to be healthy (`node scripts/dev/check-env.mjs --wait 60` exits 0 when all infrastructure is up).
4. Wait for the relay. It sweeps every 5 seconds, backs off to 60 seconds when it keeps finding nothing, and skips events newer than 3 seconds. In the test the events were published within 6 seconds of the restart.

## Verify recovery

- The `ordering-service` log shows `Outbox relay: ... event(s) published`.
- The stream lengths cover the orders placed during the outage: `docker exec <redis-events container> redis-cli XLEN events:OrderPlaced` (and `events:OrderConfirmed`) grow by one per order.
- No further `could not be published` warnings appear.

## What not to do

- Do not restart `ordering-service` to "clear" the warning: events are in the order data, not in memory, so a restart is unnecessary (a restart during the outage was not tested).
- Do not delete order documents or outbox entries by hand.
- Do not publish the events yourself: event ids are fixed, and consumers ignore a repeat, but the relay already does this.

## Escalate when

- The warnings continue after Redis is confirmed healthy for more than a few minutes (the 60-second idle ceiling plus margin). One entry that can never be published (an unknown event type, a payload that no longer deserializes) blocks that order's later events and is retried on every sweep: register item 74. Not tested here.
- More than one `ordering-service` instance runs: the relay is not leased across instances (register item 72).
- Redis does not come back: that is an infrastructure incident, not this runbook.

## Last tested

2026-10-30, local stack (Docker Compose infrastructure, the services run from source, the BFF), not deployed. Procedure: baseline order; `docker compose stop redis-events`; two orders placed through the BFF; `docker compose start redis-events`; stream lengths and relay log read. Both orders returned `CONFIRMED` in about 2.1 s during the outage; events were published within 6 seconds of the restart; no duplicates in the streams. Details and the commands: [`docs/evidence/runbook-event-broker-2026-10-30.md`](../../evidence/runbook-event-broker-2026-10-30.md). Not tested: a stuck entry (item 74), several instances (item 72), a long outage, the relay after an `ordering-service` restart during the outage.
