```
WI ID:               AUTH-001
Title:                JWT validation middleware + resource-ownership helper (/tools/auth-middleware equivalent)
Type:                 Interface/Contract
Epic:                 EPIC-AUTH
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Ready
Size:                 M
```

**Context / Why**
ADR-0006 establishes JWT bearer validation (role + resource-ownership checks, zero trust — every service validates independently) via a shared middleware library so every service does this identically. Per ADR-0006's amendment note, this item is **explicitly unaffected by the Azure AD B2C → Entra External ID swap** (open item #21) — `Microsoft.AspNetCore.Authentication.JwtBearer` validates against whatever `Authority`/`Audience` is configured, and swapping the issuer is a config change, not a code change. Safe to build now regardless of that pending swap.

**Inputs / References**
- *Decisions*: `docs/architecture/adr/0006-auth-authz-model.md` (the full design, including its amendment note), ADR-0010 (C#/.NET, `Microsoft.AspNetCore.Authentication.JwtBearer`)
- *Interfaces*: none consumed
- *Environment/tooling*: local dev uses a mock OIDC issuer per `tech-stack.md`'s Auth row — this item's middleware must work identically against the mock issuer and any real one, since it's config-driven either way
- *Test/chaos methodology*: deterministic tests only (ADR-0006 explicitly states no live chaos decorator here — auth has no fallback behavior to prove)
- *Business context*: none needed — this is a pure cross-cutting concern

**You do not need to know about**
- Which specific identity provider issues the token — Azure AD B2C, Entra External ID, or the local mock issuer are all just different `Authority` config values to this middleware
- Any service's specific role/resource-ownership rules beyond the generic mechanism (this item provides the *checker*, individual services apply it to their own resources — see the separate, not-yet-detailed `AUTH-002`)

**Out of scope**
- Does not configure a real Azure AD B2C or Entra External ID tenant (that's `AUTH-004`, explicitly held per open item #21)
- Does not implement per-service resource-ownership rules (`AUTH-002`, separate item) — this item provides the generic ownership-check helper, not each service's specific application of it

**Requirements / Acceptance Criteria**
- JWT bearer configuration (C#, per ADR-0010), config-driven and identical regardless of issuer:
```csharp
services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = configuration["Auth:Authority"];
        options.Audience = configuration["Auth:Audience"];
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(2)
        };
    });

services.AddAuthorization(options =>
{
    options.AddPolicy("VendorRole", policy => policy.RequireClaim("roles", "Vendor"));
    options.AddPolicy("AdminRole", policy => policy.RequireClaim("roles", "Admin"));
    options.AddPolicy("CustomerRole", policy => policy.RequireClaim("roles", "Customer"));
});
```
- Resource-ownership helper interface:
```csharp
public interface IResourceOwnershipChecker
{
    bool IsOwner(ClaimsPrincipal user, string resourceOwnerId);
}
```
- Deterministic xUnit tests covering: expired token rejected with 401; tampered signature rejected with 401; missing/malformed `roles` claim rejected appropriately; a valid token against a *different* configured `Authority` than the one that issued it is rejected — this last test is what actually proves the config-driven swap works, by testing against two different mock issuers, not just one

**Dependencies**
- Blocks: `AUTH-002` (per-service ownership checks, not yet detailed) needs `IResourceOwnershipChecker` to exist first
- Blocked by: none
- Can be worked in parallel with: `EVT-001`, `DATA-001`, `CACHE-003`, `CACHE-004`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. Fully specified by ADR-0006 plus the C# above; the pending IdP swap (open item #21) does not create any ambiguity for this item specifically, since it's config-driven by design.

**Open Points (working)**
*(none currently)*
