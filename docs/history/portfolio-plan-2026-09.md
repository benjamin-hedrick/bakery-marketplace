# Bakery/Coffee Marketplace — Portfolio Plan

> **Status:** Historical · retired 2026-10-30. This was the repository's original planning document. Its four jobs moved: scope and the MVP legend to `docs/product/scope.md` (now with a state column), the delivery sequence to `docs/product/roadmap.md`, the repository structure to the README, and the roles and artifacts list into `scope.md`. Kept as the September record; its relative links no longer work.

**Purpose:** A single project demonstrating end-to-end ownership across Architect, Engineering Lead/Manager, Product Owner, Digital Product Manager, Operations/SRE, and Platform Engineering roles — from idea through launch, refinement, and support.

**Domain:** A pickup-based marketplace connecting customers with local bakeries/coffee shops and independent/homemade vendors, with dietary preference matching, order customization, a live order-queue display, and sponsored placement in search. Designed for extensibility (delivery/dispatch) without building it in v1.

---

## 1. Project & Artifacts by Role

### Legend
- **[MVP]** — built for real in v1
- **[MVP-lite]** — built, but a deliberately minimal version
- **[Deferred]** — documented (ADR or one-pager) but not built

### 1.1 Domain Features

| Feature | Status | Notes |
|---|---|---|
| Catalog & listings, incl. coffee/bakery customization | MVP | Modifiers, add-ins, allergy flags on items |
| Search & discovery, dietary filtering | MVP | |
| Sponsored placement mixed into search | MVP-lite | Simple "sponsored" flag; no bidding/auction engine |
| Ordering & checkout with scheduled pickup windows | MVP | |
| Order lifecycle + live order-queue display | MVP | Event-driven; strongest demo moment |
| Customer preferences & dietary constraints | MVP | Surfaced at browse and at cart |
| Vendor onboarding & verification (independent/homemade) | MVP | Includes basic compliance checklist step |
| Notifications & background processing | MVP | Order confirmations, allergy warnings, low-stock alerts |
| Admin/moderation console | MVP-lite | Vendor verification queue, listing moderation |
| Payments & vendor payouts | MVP-lite | Simplified split-payment model; not PCI-production-grade |
| Reviews/trust | MVP-lite | Basic rating only; fraud/trust scoring deferred |
| Full ad platform (bidding, ad analytics) | Deferred | ADR only |
| Delivery/dispatch (courier, ETA, cold-chain) | Deferred | Fulfillment context designed as extension point; ADR documents the decision |
| B2B small-supplier flow | Deferred | Noted as scoped-out in domain glossary; folded conceptually into independent vendor |
| Full multi-region scale / DR | Deferred | Documented in NFRs/cost story |

### 1.2 Artifacts by Role

**Architect**
- [MVP] Vision one-pager (shared w/ Product)
- [MVP] Capability map / business architecture view
- [MVP] Bounded context map, ubiquitous language glossary, event-storming output
- [MVP] C4 diagrams — context, container (component diagrams for 1–2 key services)
- [MVP] Data model / API contracts for MVP services
- [MVP] NFRs doc (lightweight)
- [MVP] Key ADRs: event-driven backbone, data store choice, fulfillment-extensibility/delivery-deferral, auth model
- [Deferred] Full multi-region/scale architecture (documented as forward-looking ADR)

**Manager/Lead**
- [MVP] Project plan / phased roadmap
- [MVP] Risk register
- [MVP] RACI (hypothetical team)
- [MVP] Engineering standards (Definition of Done, PR/review guidelines, onboarding doc)
- [MVP-lite] Budget/cost estimate
- [MVP-lite] Hypothetical team structure + hiring plan
- [MVP-lite] Stakeholder communications plan

**Product Owner**
- [MVP] Backlog: epics + user stories + acceptance criteria
- [MVP] Prioritization (MoSCoW or RICE) — this is the doc that draws the MVP line
- [MVP] Sprint plan (first 2–3 sprints)
- [MVP] Definition of Ready

**Digital Product Manager**
- [MVP] Personas / Jobs-to-be-Done (customer, shop owner, independent vendor)
- [MVP-lite] Competitive scan
- [MVP-lite] Monetization model (commission %, ad revenue)
- [MVP] Success metrics / OKRs

**Operations/SRE**
- [MVP] SLA/SLO doc (v1 scope)
- [MVP-lite] Runbook
- [MVP-lite] Monitoring/alerting plan
- [Post-launch] Staged incident postmortem
- [Deferred] Full on-call rotation doc (documented pattern, not a real rotation)

**Platform Engineering / DevEx**
- [MVP] Local dev environment (docker-compose + seed data)
- [MVP] Configuration management (env config + basic feature-flag pattern)
- [MVP] Caching (e.g., Redis in front of catalog/search)
- [MVP] Reusable tooling (shared event-schema/types package, logging/correlation-ID helper)
- [MVP-lite] Ephemeral/preview environments (one working preview-deploy example; full fidelity documented)
- [MVP] Branching/release strategy note, dependency/versioning policy

**Governance**
- [MVP-lite] Architecture review / change-management note (lightweight TOGAF-informed phase)

**Engineering/Build**
- [MVP] Working services for MVP feature set
- [MVP] Tests + CI/CD pipeline
- [MVP] Docs site (MkDocs/Docusaurus) published via GitHub Pages
- [MVP] Narrative top-level README
- [MVP] GitHub Projects board as public roadmap/backlog

---

## 2. Sequence of First Deliverables

1. **Vision one-pager + personas/JTBD** — anchors every later decision
2. **Capability map + bounded context map + glossary** — including the explicit note scoping out B2B supplier and naming the delivery-deferral intent
3. **Key ADRs** — event-driven backbone, fulfillment extensibility/delivery deferral, data store choice, auth model
4. **C4 context & container diagrams**
5. **Backlog + prioritization (MoSCoW/RICE) + Definition of Ready** — produces the concrete Sprint 1 scope
6. **Repo scaffolding + local dev environment + CI/CD skeleton**
7. **Sprint 1 build** — walking skeleton: catalog + basic ordering + event backbone wired end-to-end (even with a stub UI)
8. **Sprint 2 build** — customization, dietary preferences, live order-queue display
9. **Sprint 3 build** — vendor onboarding, admin console, notifications
10. **"Go live" pass** — SLA/SLO finalized, monitoring/alerting wired, runbook written
11. **Refinement/support phase** — staged incident + postmortem, one feature-flagged iteration (e.g., sponsored search placement), roadmap update showing delivery as the next planned extension

Manager and Digital PM artifacts (budget, hiring plan, comms plan, competitive scan, monetization model) can be drafted in parallel with steps 1–4 since they don't block engineering.

---

## 3. Repo Structure (GitHub, Pages + Projects)

```
/docs                         # Published via GitHub Pages (MkDocs Material or Docusaurus)
  /architecture
    /c4
    /adr
    /ddd                      # bounded context map, glossary, event storming
  /product
    vision.md
    personas.md
    roadmap.md
    okrs.md
  /process
    engineering-standards.md
    definition-of-ready.md
    definition-of-done.md
    branching-strategy.md
  /operations
    sla.md
    runbooks/
    postmortems/
  /governance
    architecture-review.md

/services                     # one folder per bounded context
  /catalog-service
  /ordering-service
  /notification-service
  /admin-service

/apps
  /web-customer
  /web-admin
  /web-queue-display           # live order-queue display

/infra                        # IaC (Terraform/CDK), env configs
/tools                        # shared/reusable packages (event-schema types, logging helper, etc.)
/.github/workflows             # CI/CD pipelines

docker-compose.yml             # local dev environment
README.md                      # narrative entry point: idea → architecture → build → launch → support
```

**GitHub Pages:** publish `/docs` via MkDocs Material or Docusaurus — gives diagrams, ADRs, and product docs a browsable, polished home instead of raw markdown.

**GitHub Projects:** one board, columns `Backlog → Ready → In Progress → Review → Done`, with a roadmap/milestone view mirroring section 2 above. This board itself is a visible PM/lead artifact.

**README.md** is the front door — should narrate the whole idea → launch → support arc and link into `/docs`, not just list setup instructions.
