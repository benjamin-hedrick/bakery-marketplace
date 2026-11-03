# notification-service

Notifications: order confirmations, allergy warnings, low-stock alerts, driven by events.

**Status (2026-11-03): `NOT-001` built, local only.** It consumes the six order events in batches (one contact read per poll), skips events it already sent, and sends through an `INotificationSender` (a recording fake for tests, a log sender locally; no real provider). Contacts come from seeded mock-identity customers behind a cache. Wording is a placeholder until `NOT-002`. See `docs/product/backlog/WI-NOT-001.md`. Run on the host with `Events__Backend=redis` and the Compose Redis; tests: `dotnet test services/notification-service/tests/NotificationService.Tests` (set `REDIS_CONNECTION_STRING=127.0.0.1:6379` for the Redis test).
