```
WI ID:               SEC-001
Title:                Per-environment Key Vault + managed identity RBAC grants (Terraform)
Type:                 Infra/Environment
Epic:                 EPIC-SECRETS
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Ready
Size:                 M
```

**Context / Why**
ADR-0007 establishes per-environment Key Vaults accessed via managed identity, with the "eliminate the secret before managing it" principle (Cosmos access via RBAC, not a connection string). No Terraform exists yet for any of it. **Fully independent of batch 1** — this is infrastructure provisioning, not application code; it doesn't reference any C# interface.

**Inputs / References**
- *Decisions*: `docs/architecture/adr/0007-secrets-management.md` (the full design — per-environment vaults, managed identity, Terraform never writes literal secret values)
- *Interfaces*: none
- *Environment/tooling*: `docs/architecture/tech-stack.md` (per-environment `.tfvars` structure already established in `/infra/environments`)
- *Test/chaos methodology*: not applicable — infra provisioning, validated by `terraform plan`/`apply` succeeding, not unit tests
- *Business context*: none

**You do not need to know about**
- Any application code — this item is Terraform only
- Actual secret values — never written by this item, populated out-of-band per ADR-0007

**Out of scope**
- Does not populate actual secret values (Stripe keys, etc.) — out-of-band per ADR-0007, not this item's job
- Does not configure Redis access keys — held pending open item #22 (Redis vendor reconsideration)
- Does not build the fail-fast validation tests (`SEC-003`, separate item)

**Requirements / Acceptance Criteria**
- One `azurerm_key_vault` resource per environment (`dev`, `staging`, `prod`), each in its own `.tfvars`-driven configuration, matching the existing `/infra/environments` structure
- Each Container App service gets a system-assigned managed identity with `get`/`list` RBAC scoped to only its own environment's Key Vault — no cross-environment access
- Cosmos DB access is granted via Azure AD RBAC to each service's managed identity, not a connection-string secret, per ADR-0007's "eliminate the secret" principle
- Any Terraform variable capable of carrying a sensitive value is marked `sensitive = true`
- No literal secret value appears anywhere in the `.tf` files or is output in plan/apply logs

**Dependencies**
- Blocks: none directly, but real deployment work benefits from this existing first
- Blocked by: none
- Can be worked in parallel with: everything, including all of batch 1

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: run `terraform plan` and manually confirm no secret value appears in the output — this is a hard requirement per ADR-0007, not just a convention.

**AI-agent suitability**
Yes. Fully specified by ADR-0007; standard Terraform patterns for Key Vault + managed identity RBAC.

**Open Points (working)**
*(none currently)*
