# Open Items Register

A working list of deferred decisions, named limitations, and not-yet-built pieces surfaced across the ADRs and repo scaffolding so far. This is a **staging area, not a backlog** — each item below is written so it can be copy-pasted into a GitHub Issue and added to the repo's Projects board once picked up. Remove an item from here once it has a corresponding Issue.

Suggested Issue fields per item: Title, Type, Source, Suggested hat/owner, Notes (below, in that order).

---

**1. Redis Basic tier has no AAD data-plane auth**
Type: Tech debt / future work · Source: ADR-0002 · Hat: Architect
If a higher Redis tier is ever justified, switch to AAD-based auth and drop the access-key secret entirely (ties to ADR-0007's "eliminate the secret" principle).

**2. Cosmos DB Linux emulator has partial API coverage and can be resource-heavy locally**
Type: Known limitation · Source: ADR-0004 · Hat: Platform Engineering
Mitigated by `FakeRepository` for the fast unit-test loop; only affects integration-test fidelity.

**3. Cosmos DB shared RU budget across containers (noisy-neighbor risk)**
Type: Accepted risk · Source: ADR-0004 · Hat: Architect / Operations
A throughput spike in one container can throttle another. Revisit if this becomes a real problem under load.

**4. Cosmos DB security blast radius — per-container resource tokens not implemented**
Type: Future hardening · Source: ADR-0004 · Hat: Architect / Governance
Natural next step before a full account split would be justified.

**5. Cosmos DB partition key choices are v1 guesses, not validated under real load**
Type: Tech debt · Source: ADR-0004 · Hat: Architect
Revisit `customerId`/`vendorId` partitioning once real traffic patterns exist.

**6. Payments: chargeback/dispute handling deferred**
Type: Deferred scope / risk · Source: ADR-0005 · Hat: Manager/Lead (risk register), Operations
Should be logged in the risk register, not just this file.

**7. Payments: single currency (USD) / single region (US) assumed**
Type: Deferred scope · Source: ADR-0005 · Hat: Digital PM / Architect
Would need real rework, not just configuration, for international support.

**8. Auth: no centralized policy engine (OPA or similar)**
Type: Deferred architecture · Source: ADR-0006 · Hat: Architect
Per-service ownership checks are sufficient at current scale; revisit if resource types or role complexity grow.

**9. Secrets: rotation requires a service restart, no live rotation**
Type: Known limitation · Source: ADR-0007 · Hat: Platform Engineering
Key Vault's automatic rotation policies are the natural v2 enhancement.

**10. `docker-compose.yml` is still a stub**
Type: Not started · Source: repo scaffold · Hat: Platform Engineering
Needs: Redis Streams service (default), Cosmos emulator service (default), cache service (profile-gated), Stripe CLI wiring, seed/fixture data script.

**11. Reusable tooling packages not yet scaffolded**
Type: Not started · Source: ADR-0003, ADR-0006 · Hat: Platform Engineering
`/tools/event-schemas`, `/tools/logging-helper`, `/tools/auth-middleware`, and the shared fault-injection harness are named in ADRs but not yet built.

**12. GitHub Projects board not yet created**
Type: Not started · Source: portfolio-plan.md · Hat: Manager/Lead
Columns: `Backlog → Ready → In Progress → Review → Done`, per the original plan.

**13. Docs site not yet published via GitHub Pages**
Type: Not started · Source: portfolio-plan.md · Hat: Engineering/Build
`mkdocs.yml` is ready; needs the actual publish step (`mkdocs gh-deploy` or a Pages Actions workflow).

**14. CI workflow is still a placeholder**
Type: Not started · Source: repo scaffold · Hat: Platform Engineering
`.github/workflows/ci.yml` has no real build/test/deploy stages yet.

**15. No working ephemeral/preview environment example**
Type: Not started · Source: tech-stack.md · Hat: Platform Engineering

**16. Delivery/dispatch fulfillment strategy — deferred**
Type: Deferred scope (by design) · Source: ADR-0001 · Hat: Architect / Digital PM
Named as the primary planned v2 extension; not a gap, just not yet scheduled.

**17. Full ad-bidding platform — deferred**
Type: Deferred scope (by design) · Source: bounded context map, ADR area · Hat: Digital PM

**18. B2B small-supplier flow — explicitly scoped out**
Type: Scoped out (by design) · Source: glossary.md · Hat: Digital PM
Not a gap — documented as considered and rejected for v1.

**19. Work-item template — resolved**
Type: Done · Source: this planning conversation · Hat: Product Owner
Defined and validated against two real examples; see `project-process-framework/templates/work-item-template.md` and `docs/product/backlog/`.

**20. API Gateway / BFF layer — resolved**
Type: Done · Source: this planning conversation · Hat: Architect
Azure API Management, Consumption tier, with zero-trust dual validation (edge fast-fail + authoritative per-service check unchanged from ADR-0006). See ADR-0008.

**21. Azure AD B2C → Microsoft Entra External ID — planned, not yet executed**
Type: Planned tech swap · Source: user direction, ADR-0006 amendment, ADR-0010 · Hat: Architect
Azure AD B2C stopped accepting new tenants May 2025; Premium P2/Identity Protection retired March 2026; full support continues to ~2030 but the platform is frozen. Microsoft's stated successor for new work is Entra External ID (GA since 2024). This project targets Entra External ID instead. The JWT validation design (issuer/audience/JWKS-driven, `Microsoft.AspNetCore.Authentication.JwtBearer` per ADR-0010) is config-driven and unaffected by which issuer is configured. **Hold `AUTH-004`** (tenant/policy configuration) from agent assignment until this is finalized — `AUTH-001` (generic validation middleware) is unaffected and safe now.

**22. Redis vendor reconsideration — planned, not yet decided**
Type: Planned tech swap · Source: user direction, ADR-0002 amendment · Hat: Architect
The specific managed cache vendor (Azure Cache for Redis) may change. `CacheProvider`, `LocalCacheProvider`, `ResilientCacheProvider`, and the contract-test suite are all vendor-agnostic and safe to build now. **Hold `CACHE-002`** (RedisCacheProvider implementation) **and `CACHE-005`** (Terraform managed-Redis toggle) from agent assignment until the vendor decision is finalized.

**23. Documentation cleanup: stale "Azure AD B2C" references in historical diagrams/docs**
Type: Low-priority cosmetic cleanup · Source: this review pass · Hat: Architect
`docs/architecture/c4/context.md`/`container.md`, `docs/management/budget-cost-estimate.md`, and a few closed work-item files still name Azure AD B2C directly rather than Entra External ID. Not functionally incorrect (the swap doesn't change any diagram's actual shape), just cosmetically stale. Living reference docs (`tech-stack.md`, ADR-0006) are already corrected — this item is for the rest, whenever it's convenient, not urgent.

**24. No refresh-token / silent-renewal flow in the frontend auth pattern**
Type: Known limitation (v1) · Source: ADR-0011, `WI-WEB-001`/`WI-AUTH-005` · Hat: Engineering/Build, Architect
Access tokens are held in memory only and expire with no background refresh — a user simply gets logged out and must re-authenticate. Acceptable for a local/demo-scale app with short sessions; a real production frontend would need either silent-refresh-via-hidden-iframe or a refresh-token grant (the latter would also reopen the cookie-vs-header storage question closed in ADR-0006 §3.3's CSRF analysis, so isn't a drop-in addition). Named here explicitly rather than left as an unstated gap, consistent with `WI-NFR-001`'s "aspirational/future" discipline.
