# tools

Shared C# libraries, with their tests in `tools/tests`. The libraries that stand in front of something swappable follow one pattern: an interface, a real and a local implementation, a shared abstract contract-test base, and a chaos decorator where resilience matters (`docs/architecture/patterns.md`).

| Project | What it is |
|---|---|
| `BakeryMarketplace.Auth` | JWT validation, role and resource-ownership policies, and a local mock OIDC issuer (browser login with PKCE and service client credentials) |
| `BakeryMarketplace.MockOidcHost` | Hosts the mock issuer (the Compose `mock-oidc` service) |
| `BakeryMarketplace.Caching` | `ICacheProvider` with Redis, local, resilient (circuit-breaking fallback) and chaos implementations. No service uses it yet |
| `BakeryMarketplace.Data` | `IRepository<T>` with a fake and a Cosmos implementation, optimistic concurrency and transactional batches |
| `BakeryMarketplace.Eventing` | The event envelope, `IEventPublisher` and `IEventSubscriber`, with an in-memory and a Redis Streams transport |
| `BakeryMarketplace.EventSchemas` | Domain event payload records and the fulfillment contracts |
| `BakeryMarketplace.Logging` | Trace-id correlation middleware, structured logging and OpenTelemetry setup |
| `BakeryMarketplace.Secrets` | Fail-fast validation of required secrets at startup |
| `BakeryMarketplace.Seed` | Seeds the local stack: listings, and `VendorVerified` for the seeded vendors |

Build and test: `dotnet build BakeryMarketplace.slnx` and `dotnet test tools/BakeryMarketplace.slnx` from the repository root. Some adapter tests fall back to fakes when Docker is not running; see `docs/process/quality-gates.md`.
