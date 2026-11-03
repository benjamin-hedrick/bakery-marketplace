> **Status:** Ready · evidence: none yet; `services/notification-service` is an empty scaffold

```
WI ID:               NOT-001
Title:                Notification service: consume order events and dispatch through a sender adapter
Type:                 Service Implementation
Epic:                 EPIC-NOTIFICATIONS
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 M
```

**Context / Why**
Ordering publishes six order events (`OrderPlaced`, `OrderConfirmed`, `OrderPreparationStarted`, `OrderReadyForFulfillment`, `OrderCompleted`, `OrderCancelled`) through the outbox, and nothing consumes them except the vendor queue. Notifications is a Conformist context (`docs/architecture/ddd/bounded-contexts.md`): it has no domain rules, it turns events into messages. This item is the second consumer of the event backbone and the first real use of per-service consumer groups (register item 29).

**Inputs / References**
- *Decisions*: ADR-0003 (at-least-once, consumers dedupe on `EventId`), ADR-0009 (notification is one of four services), ADR-0016 (trace context), ADR-0006/0008 (the service validates what it exposes itself)
- *Interfaces*: `IEventSubscriber` and `RedisStreamsEventTransport` with `serviceName: "notification-service"`; payload records in `BakeryMarketplace.EventSchemas`; pattern: `services/catalog-service/src/Services/VendorEventSubscriptions.cs`
- *Open items*: 75 (stream retention is sized when the first consumer exists), 29 (resolved; group per service)

**Requirements / Acceptance Criteria**
- A hosted subscriber in `notification-service` subscribes to the six order event types. Each handler is idempotent on `EventId` (a repeat sends nothing a second time) and a failure leaves the message pending for redelivery, as the transport already does.
- Delivery goes through `INotificationSender` (adapter pattern, as in `tools/`): a recording fake for tests and a local sender that writes the message to the log without the address or the body's personal data. A shared abstract contract-test base is inherited by every sender. No real email provider is built.
- Contact lookup goes through `IContactDirectory` with a **batch** signature (`GetContactsAsync(IReadOnlyCollection<string> customerIds)`), implemented over seeded data (the mock identity's customers). The contact address is **not** added to the events (no personal data on the backbone). A customer with no contact is recorded as "no contact" and skipped, not retried.
- Whether to add a micro-batcher (collect events for a few milliseconds, then one batch read) is decided after measuring; the interface allows it without a change. The seeded directory is in memory, so batching gains nothing yet.
- `Events:MaxStreamLength` is given a value with the consumer's maximum backlog stated (register item 75).
- Logs carry order id, event id and type only: no address, name or free text.
- Tests: handler idempotency, redelivery after a failing sender, unknown customer, contract tests for the sender and the directory, and one test against the local Redis (skipped without `REDIS_CONNECTION_STRING`).

**Out of scope**
- Templates and message wording (`NOT-002`); a real email, SMS or push provider; customer notification preferences; allergy warnings and low-stock alerts (see `NOT-002`).

**Dependencies**
- Blocked by: none (`ORD-005` and `EVT-003` are Done)
- Blocks: `NOT-002`
