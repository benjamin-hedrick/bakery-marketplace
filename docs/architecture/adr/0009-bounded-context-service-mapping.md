# ADR-0009: Bounded-Context-to-Service Mapping

**Status:** Accepted

## Context

Four services were scaffolded early in this project (`catalog-service`, `ordering-service`, `notification-service`, `admin-service`), before the full set of ADRs existed and before any formal decision-record discipline was in place. At the time, this felt like routine setup. In fact it silently made a real architecture decision: which of the project's ~13 bounded contexts (per `docs/architecture/ddd/bounded-contexts.md`) get their own deployment boundary, and which don't. That decision was never made explicitly — it was only discovered by accident while drawing the C4 container diagram (`WI-ARCH-001`), which surfaced that Search & Discovery, Advertising/Promotions, Preferences & Dietary Safety, Reviews/Trust, and Vendor Onboarding & Verification had no assigned service at all.

This ADR makes that mapping explicit and formal, rather than leaving it as an implicit byproduct of scaffolding.

## Decision

**Keep the 4 existing scaffolded services. Group the remaining 9 bounded contexts into them as follows, rather than introducing new services:**

| Service | Bounded contexts hosted |
|---|---|
| `catalog-service` | Catalog & Customization (original) + Search & Discovery + Advertising/Promotions + Preferences & Dietary Safety |
| `ordering-service` | Ordering & Fulfillment (original) + Reviews/Trust + Payments/Payouts integration (checkout-charge trigger and Stripe-webhook-driven payout reconciliation only — actual payment processing remains external per ADR-0005) |
| `admin-service` | Admin/Moderation (original) + Vendor Onboarding & Verification |
| `notification-service` | Notifications only (unchanged — stays a pure, generic, event-triggered dispatcher) |

**Vendor Onboarding stays in `admin-service`, not `catalog-service`,** even though Catalog is Vendor's direct downstream consumer (per the bounded context map's Customer/Supplier relationship). This preserves the *original* designed relationship — Catalog conforms to a feed Vendor publishes — as a genuine cross-service interaction via the event backbone (ADR-0003), rather than collapsing it into an in-process shortcut just because co-locating them was possible. Splitting Vendor's data storage from its verification workflow across two services was also considered and rejected — a bounded context should live in exactly one deployment unit, never split across two.

**Modular monolith rule, binding for every grouped service above**: contexts sharing a service communicate through the same published interfaces/events they would use if physically separate — never a direct in-process reach into another context's data or Cosmos container. Concretely: `catalog-service`'s internal Search module consumes Catalog's listing feed and Preferences' snapshot through the same Open Host Service contracts named in the bounded context map, as in-process calls implementing those contracts — not by directly querying the `catalog` or `preferences` Cosmos containers from Search's code. This is the same "isolate in code, allow physical split later" posture ADR-0004 already applies to Cosmos's shared account and ADR-0001 applies to the Fulfillment Strategy seam, reapplied here at the service-grouping layer.

## Consequences

**Positive**
- No new services to build, deploy, or operate — stays consistent with the free-tier-first, minimize-operational-complexity posture already established
- Every bounded context now has an explicit, documented home — nothing is silently unassigned
- The modular monolith rule means splitting any grouped context into its own service later (e.g., if Search's read load ever justified independent scaling) is a deployment change, not a rearchitecture, because the interface boundary was never violated internally

**Negative / accepted limitations**
- `catalog-service` now hosts four bounded contexts, including two core-domain ones (Catalog, Preferences) and two supporting/generic ones (Search, Advertising) — this is a real concentration of responsibility in one deployable unit, and its independent scalability is now coupled: if Search's read load spikes, the whole service scales, not just Search. Accepted for MVP scale; the modular monolith rule is specifically what keeps this reversible rather than a permanent constraint.
- This grouping was decided after the fact, once the gap was already discovered — not before scaffolding, which is exactly the failure mode this ADR (and the corresponding process fix) exists to prevent from recurring. It's being formalized now rather than left implicit any further, but the ideal sequencing (decide before scaffolding) wasn't followed the first time.
- Enforcing the modular monolith rule in practice depends on code review discipline (`docs/process/engineering-standards.md`) — nothing currently prevents a future contributor from taking the in-process shortcut the rule forbids; this is a process control, not a technical one, unless a future item adds actual module-boundary linting.

## Alternatives considered

1. **A dedicated service per bounded context (10 total, up from 4).** Rejected — the free-tier cost story stays roughly the same (Container Apps consumption plan scales to zero regardless of count), but operational complexity (more CI/CD pipelines, more Compose services, more cross-service call overhead for what are often tightly related reads) isn't worth it at this project's scale and would dilute focus from the actually-differentiating contexts.
2. **Group by technical layer instead of domain** (e.g., one "read service" for everything read-heavy, one "write service" for everything transactional). Rejected — this cuts directly across the bounded context boundaries the DDD work already established, and would make the modular monolith rule impossible to state coherently (there'd be no clean context boundary left to protect).
3. **Move Vendor Onboarding into `catalog-service`** instead of `admin-service`, since Catalog is its direct consumer. Rejected — see Decision section; this would make Vendor Onboarding's data and its verification workflow (which admin-service's moderation queue directly depends on) split across two services, worse than either single-service option.

## Related

- `docs/architecture/ddd/bounded-contexts.md` — the logical boundaries this ADR assigns to physical deployment units
- ADR-0001 — same "isolate in code, allow splitting later" posture, applied to the Fulfillment Strategy seam
- ADR-0004 — same posture, applied to Cosmos DB's shared account
- `docs/architecture/c4/container.md` — the diagram whose drafting surfaced this gap; the 🔶-flagged proposal there is now confirmed by this ADR
- Process lesson: this sequencing gap (the mapping decided after scaffolding instead of before) was found by drawing the container diagram, a surprise (`docs/method/glossary.md`): the missing decision became this record. The proactive half is context completeness: before scaffolding, ask which structural decisions the scaffold would make implicitly and make them explicitly first.

## Note, 2026-11-08: the preference snapshot was dropped

This decision names Preferences as publishing a snapshot to Search and Ordering. That was dropped on 2026-11-04 (ADR-0022, `WI-PREF-002` superseded): the catalog reads the profile in-process and the allergens a customer tells a bakery travel on the order (`WI-ORD-009`). The service grouping itself is unchanged.
