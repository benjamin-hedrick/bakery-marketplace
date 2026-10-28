# ADR-0010: Service Implementation Language & Framework — C# / .NET

**Status:** Accepted

## Context

No programming language or framework was ever decided for the four services. Container Apps (already chosen as the hosting platform) is language-agnostic by design, so nothing forced this decision until now — surfaced when asked whether component-level C4 diagrams would be worth drawing before it. Every Interface/Contract work item drafted so far (`CacheProvider`, `Repository<T>`, `EventPublisher`/`EventSubscriber`) described signatures in language-neutral pseudocode; those need concrete signatures before they're usable by anyone (or any agent) actually writing code.

## Decision

**C# on .NET 8 (LTS), ASP.NET Core Web API**, containerized for Container Apps.

- **Data access**: `Microsoft.Azure.Cosmos` SDK directly (no ORM), wrapped by `Repository<T>` implementations — LINQ/parameterized queries only, per the injection-protection baseline in `nfrs.md` §3.4
- **Cache**: `StackExchange.Redis` for `RedisCacheProvider` (when built); `IMemoryCache` (built into ASP.NET Core) for `LocalCacheProvider`
- **Event backbone**: `Azure.Messaging.EventGrid` (cloud); `StackExchange.Redis` Streams API (local), per ADR-0003
- **Auth**: `Microsoft.AspNetCore.Authentication.JwtBearer` — this is Authority-URL/JWKS-driven and config-only, meaning it validates tokens from *any* OIDC-compliant issuer without code changes. This directly derisks the pending Azure AD B2C → Entra External ID swap (see ADR-0006's amendment note) — the swap becomes a config change, not a rewrite.
- **Secrets**: `Azure.Security.KeyVault.Secrets` + `DefaultAzureCredential` (managed identity), per ADR-0007
- **Testing**: xUnit, with shared abstract test-base classes implementing each interface's contract-test suite (ADR-0002/0003/0004's pattern) — a new concrete implementation "inherits" the contract suite by subclassing the shared base, rather than the suite being rewritten per implementation
- **Solution structure**: one .NET solution; one ASP.NET Core Web API project per service (`CatalogService`, `OrderingService`, `AdminService`, `NotificationService`); shared class libraries for everything currently scaffolded under `/tools` (`BakeryMarketplace.EventSchemas`, `BakeryMarketplace.Caching`, `BakeryMarketplace.Auth`, `BakeryMarketplace.Logging`), referenced by each service project — maps directly onto the existing `/services` and `/tools` folders, no restructuring needed

## Consequences

**Positive**
- Strong typing catches interface-contract violations at compile time — a good fit for a design this adapter-pattern-heavy
- Mature, first-party Azure SDK support for every Azure service already chosen (Cosmos, Event Grid, Key Vault) — no third-party client library risk
- ASP.NET Core's JWT bearer handler makes the pending identity-provider swap a configuration change, not a code change
- xUnit's shared-base-class pattern maps naturally onto the contract-test-suite pattern already established

**Negative / accepted limitations**
- Introduces a real toolchain (.NET SDK, NuGet) — accepted, this was a direct decision, not a tradeoff to relitigate
- Every previously-drafted Interface/Contract work item's "Interface signature/shape" section was written in language-neutral pseudocode and needs updating to real C# — done as part of this same round for the items being prepared for agent assignment (see `docs/product/backlog/`)

## Alternatives considered

Not a real debate — this was a direct instruction, not an open technology evaluation. Node.js/TypeScript, Python/FastAPI, and Java/Spring Boot would all have been reasonable choices given the existing Azure-first stack; C# was specified directly.

## Related

- `docs/architecture/tech-stack.md` — adds the Language/Framework row this ADR resolves
- ADR-0002, ADR-0003, ADR-0004 — the interfaces this ADR gives concrete signatures to
- ADR-0006's amendment note — how this ADR's auth library choice derisks the Entra External ID swap
- Every Interface/Contract work item prepared for agent assignment in this same round

## Amendment 2026-10-28: target .NET 10 (LTS)

Human lead approved moving every project from .NET 8 to **.NET 10** (`net10.0`). The decision above (C#, ASP.NET Core Web API, the library choices) stands; only the framework version changes. Reasons: the local SDK and the Azure Pipelines agent were already on 10, the pipeline otherwise needed both SDKs, and .NET 8 support ends in November 2026. Container Apps images move to `mcr.microsoft.com/dotnet/aspnet:10.0` (the mock OIDC host already did). Effects found while upgrading: `Microsoft.AspNetCore.Authentication.JwtBearer` 10.x requires `System.IdentityModel.Tokens.Jwt` 8.19.2 or newer, and a project may no longer reference two assemblies that each define a global `Program` (the Seed tool now has an explicit entry point). Evidence: `docs/evidence/WI-PORT-003/findings.md`.
