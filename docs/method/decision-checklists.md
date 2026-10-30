# Decision checklists: technology and business

> **Status:** Current · written 2026-10-30, **retrospectively**: these were not run at the start of the project. The "How it was answered here" column is filled from the records that exist, including where the answer came late. They are the front-loaded half of [context completeness](context-completeness.md): the recurring questions that are easy to leave unstated and expensive to find out later.

**How to use.** Run each checklist once, early (during vision and scope work, before any scaffolding), not per decision. Write the answer down even when it is "yes, obviously": stating the obvious costs a sentence, and not stating it costs a surprise. A question with no answer yet is recorded as open, with an owner, in the register. These are guided defaults ([rule-authoring.md](rule-authoring.md)): the questions are not optional, but the depth is the lead's call. New questions come from the [surprise rule](surprise-rule.md): when a surprise shows that a question should have been asked, it is added here with the surprise it came from.

## Technology and architecture

| Question | How it was answered here | Where recorded |
|---|---|---|
| **Zero trust or perimeter?** Is any component trusted on network position alone, or does every service re-check authentication and authorization itself? | Every service validates tokens and ownership itself, whatever sits in front. *Stated late:* it surfaced when an API gateway was chosen | ADR-0006, ADR-0008, `nfrs.md` 3.1 |
| **Where do credentials live in transit?** Headers only, or cookies anywhere? (This decides whether CSRF mitigation is relevant.) | Authorization header only; the access token is held in browser memory; no cookie. A planned cookie session would reopen this | ADR-0006, `nfrs.md` 3.3, register 24 |
| **Data sensitivity.** Is any handled data quasi-regulated (health-adjacent, financial)? | Dietary and allergy information is treated as quasi-health data; card data never reaches the services (PCI scope SAQ A) | Vision principle 1, `nfrs.md` 3.7 and 4 |
| **Injection protection.** Is data access parameterized by default? | Yes: parameterized SDK queries only. *Stated late:* first written in the NFRs | `nfrs.md` 3.4 |
| **Build or buy**, per major capability. What does the vendor not cover? | Payments bought (Stripe Connect); identity bought (Entra External ID); services, BFF and web built | ADR-0005, ADR-0006 |
| **Cost and tier posture.** Free-tier-first or optimize later? Have the free tier's actual limits been checked? | Free-tier-first for development and demo. Limits were checked for some services; the identity allowance and current cache pricing were not re-verified | `tech-stack.md`, `budget-cost-estimate.md` |
| **Extensibility.** Which deferred features need a seam now? | The fulfillment seam for delivery (events only); event schema versioning; the BFF as the single browser entry | ADR-0001, ADR-0003, ADR-0013 |
| **Decomposition.** Is every logical boundary assigned to a deployable unit *before* scaffolding, and is it explicit that grouped boundaries still talk through the interfaces and events they would use if separate? | Thirteen contexts onto four services, modular-monolith rule. *Decided after scaffolding:* the four services were created first and the mapping came when the container diagram was drawn | ADR-0009 |
| **Local development.** For each managed dependency, is there a real local equivalent, a degraded local mode, or none? | Cosmos emulator, Redis, mock identity issuer, local trace viewers; payments through a stub (Stripe test mode and CLI not wired); no local API gateway | `tech-stack.md`, `docs/operations/local-dev.md` |

**Added from this project's experience** (each came from a surprise):

| Question | Came from |
|---|---|
| Which service owns each piece of shared mutable state (stock, an order), and when is it reserved and released? | Writing the order lifecycle: ADR-0017 |
| How does one service authenticate to another, and what is the credential for each environment? | Ordering needing the catalog's stock endpoints: ADR-0018 |
| What is the correlation mechanism across services and processes, and what must never be exported in a trace or a log? | The tracing work: ADR-0016, `nfrs.md` 3.6 |
| What happens when each dependency is down: what does the user see, and was that tested against the real dependency or only a fake? | The fallback review: [patterns](../architecture/patterns.md), section 10 |
| Which environment decisions are an environment target and which are a runtime fallback, and why? | Tests silently using fakes: [patterns](../architecture/patterns.md), "Two meanings of fallback" |
| Money, time and identifiers: the representation of money, the time zone and daylight-saving rule for scheduled times, and who generates identifiers. | The first-slice contract: integer cents, UTC windows, an order id derived from the idempotency key |

## Business and product

| Question | How it was answered here | Where recorded |
|---|---|---|
| **Scope boundaries.** Is every "obviously not in v1" idea written down as scoped out, with a reason? Are considered-and-rejected ideas recorded? | Deferred and scoped-out items are listed with reasons; the B2B supplier flow is a glossary entry; delivery is deferred behind a seam | `docs/product/scope.md`, `docs/architecture/ddd/glossary.md`, ADR-0001 |
| **Legal and compliance.** An explicit in-or-out decision on terms of service and a privacy policy? Any regulated-data implication for the business, not only for the code? | *Not decided:* still an open decision, so silence has continued. It is a risk (R-09) and a backlog item (`GOV-002`) | `risk-register.md`, `epic-catalog.md` |
| **Monetization and value model**, even simplified. Recorded once, not duplicated across epics? | A commission on each order and a simple sponsored flag; one spec (`WI-PROD-003`) is the single home, cross-listed once from the advertising epic | ADR-0005, `WI-PROD-003` |
| **Stakeholders.** Who decides scope trade-offs, and is there a reporting cadence? | One lead decides; AI assistants contribute. The stakeholder plan and RACI are hypothetical (the RACI is deferred) | `stakeholder-communications-plan.md`, `WI-MGMT-003` |
| **Success criteria.** A north-star metric, with features tracing to it? | A safety metric is named in the vision; objectives and key results are not written yet (`WI-PROD-004` is Ready) | `docs/product/vision.md`, `okrs.md` |

**Added from this project's experience:**

| Question | Came from |
|---|---|
| What pace and capacity is assumed? If none is decided, say so and do not invent dates. | The project plan, which is relative, not calendar-dated |
| What does "done" mean for a demonstration, and what can a person do locally at each stage? | The demo milestones |
| Who may see the repository, under what licence, and what has to be true before it is published? | The public-readiness pass, register item 93 |

## Related

[Context completeness](context-completeness.md) · [surprise rule](surprise-rule.md) · [rule authoring](rule-authoring.md) · [ADR index](../architecture/adr/README.md)
