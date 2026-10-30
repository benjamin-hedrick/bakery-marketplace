> **Status:** Done · evidence: `tools/BakeryMarketplace.Secrets` and its tests

```
WI ID:               SEC-003
Title:                Fail-fast startup validation for missing/malformed secrets
Type:                 Test/Mock/Chaos
Epic:                 EPIC-SECRETS
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Done
Size:                 S
```

**Context / Why**
ADR-0007 requires every service to validate all required secrets are present and well-formed at startup, failing immediately with a clear error rather than surfacing an obscure failure deep in a request path later. This is a deterministic-test item (ADR-0007 explicitly rejected live chaos testing here, same reasoning as ADR-0006's auth tests — there's no meaningful degraded mode for "can't get the Stripe key"). **Fully independent of batch 1.**

**Inputs / References**
- *Decisions*: `docs/architecture/adr/0007-secrets-management.md` (the fail-fast requirement and its reasoning)
- *Interfaces*: none consumed
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: deterministic tests only, per ADR-0007's own stated reasoning — this item *is* that test suite
- *Business context*: none

**You do not need to know about**
- Any application business logic — this validates configuration presence/shape, not domain behavior
- Real Key Vault connectivity — tests run against configuration objects directly, not a live vault

**Out of scope**
- Does not provision Key Vault itself (`SEC-001`, separate item)
- Does not implement live chaos testing for secret retrieval failures — explicitly rejected by ADR-0007

**Requirements / Acceptance Criteria**
- A startup validation routine (e.g., an `IValidateOptions<T>` implementation or an explicit startup check) that inspects required configuration values (connection endpoints, expected secret names) and throws a clear, descriptive exception if any are missing or malformed — before the host starts accepting requests
- xUnit tests proving: a missing required secret name fails startup with a specific, identifiable error message (not a generic null-reference exception); a malformed value (e.g., an empty string where a URL is expected) fails startup the same way; a fully valid configuration starts up cleanly
- Test coverage should be written generically enough to apply to any service's required-secrets list, not hardcoded to one service

**Dependencies**
- Blocks: none
- Blocked by: none
- Can be worked in parallel with: everything, including `SEC-001` and all of batch 1

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. Fully specified by ADR-0007; standard startup-validation pattern, no dependency on unverified interfaces.

**Open Points (working)**
*(none currently)*
