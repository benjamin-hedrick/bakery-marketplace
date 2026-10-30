> **Status:** Done · evidence: the Outcome note under this banner

# WI-PORT-007 — Define first-slice domain/API contract and mapping

> **Outcome note (2026-10-28):** done. Decisions D-1 to D-4 accepted 2026-10-26 and D-5 to D-10 accepted as written 2026-10-28; the REST shapes and GraphQL schema draft moved into `docs/architecture/data-model-api-contracts.md` ("First-slice mapping") under `WI-PORT-006` pass 2, and `first-slice-contract.md` stays as the slice-scope record. Implementation check against the code (D-9 and D-7 gaps) is in the contract's section 11; D-9 was fixed the same day. Remaining contract-level follow-ups are open items 39 to 41 and 48 in `open-items-register.md`.

```
WI ID:               PORT-007
Title:                First-slice domain/API contract and GraphQL mapping
Type:                 Interface/Contract
Epic:                 EPIC-PORTFOLIO-SLICE
Shared with epic(s):  EPIC-CATALOG, EPIC-ORDERING, EPIC-WEB-CUSTOMER
Hat/Owner:            Architect (one contract integrator)
Status:               Done
Size:                 TBD
```

**Decisions**: ADR-0013 (BFF owns composition, not domain rules), ADR-0009 (service ownership), ADR-0014 (Relay/HTTP cache behavior for mutations).

**Priority:** Prerequisite to parallel implementation of the first slice  
**Type:** Contract/design artifact with executable contract tests where practical  
**Owner:** One contract integrator accountable for the end-to-end consistency; catalog and ordering service implementers/reviewers contribute.  
**Dependencies:** Review existing models and contracts; reconcile major boundary decisions. Can draft alongside the isolated SSR proof.

## Goal

Specify the smallest end-to-end browse-to-order contract using existing domain concepts and service boundaries. The GraphQL schema is a client-facing composition contract; C# service endpoints and domain models remain authoritative for business rules, price, listing state, pickup availability, order state, and persistence.

## Existing sources to reuse

- `docs/architecture/data-model-api-contracts.md` — `Listing`, `Modifier`, `Order`, `pickupWindow`, and existing catalog/ordering endpoint proposals.
- `docs/architecture/ddd/glossary.md` and `docs/architecture/ddd/event-storming.md` — domain language, lifecycle, commands/events.
- `docs/architecture/ddd/bounded-contexts.md` and ADR-0009 — ownership and service mapping.
- `docs/architecture/c4/container.md` and `docs/architecture/capability-map.md` — current system/service maps.
- `docs/product/backlog/WI-CAT-001.md`, `WI-ORD-001.md` through `WI-ORD-006.md`, `WI-DEV-004.md`, `WI-WEB-001.md`, and relevant delegation packets — existing backlog requirements and seed/test-fixture intentions.
- Existing C# types, API scaffolds, repository/test helpers and event schema code in `services/` and `tools/` — inspect before designing new equivalents.

These are useful source material, not proof that all proposed contracts are implemented or mutually consistent. Record gaps rather than assuming code exists.

## Required outputs

1. **First-slice scope and state model:** listing browse/detail, supported modifier/customization selection, pickup-window choice, test-mode checkout, persisted order confirmation/status. Explicitly identify what is mocked/stubbed versus real.
2. **Domain/API contract table:** operation, owning C# service, REST endpoint/request/response, GraphQL field/input/output, mapping, validation owner, failure cases, test coverage.
3. **GraphQL schema draft:** minimum listing query/detail and minimum mutation path needed for the walking skeleton; avoid designing the whole marketplace schema.
4. **Seed data contract:** deterministic IDs and representative published listings, modifier/allergen examples, vendor status assumptions, pickup windows, and expected price totals. Reuse the intended seed mechanism if `WI-DEV-004` supports it; do not create a second unrelated seed source.
5. **Error and state behavior:** loading, empty results, not-found, unavailable/expired pickup window, invalid modifier, rejected checkout, duplicate submit/idempotency, and safe client-visible error mapping.
6. **Contract tests:** tests proving BFF mapping and service validation agree, including price not trusted from client input and order state returned from persisted authoritative state.
7. **Trace/correlation requirements:** propagate trace context and safe correlation metadata across Next.js → GraphQL BFF → C# service; don't pass secrets or unnecessary personal data.
8. **Decision log:** list unresolved decisions, recommend a default where possible, name the decision owner, and state what work each decision blocks.

## Key constraints

- Never move business rules into the GraphQL BFF.
- Do not treat the existing `Order` model's `Placed` status and the portfolio's “confirmation/status” UI as a reason to invent additional lifecycle states. Map current states accurately and propose changes explicitly if required.
- Do not invent currency, tax, pricing, availability, time-zone, or idempotency policy. Surface these as explicit open decisions where current docs are silent or inconsistent.
- Do not activate real payment processing; use a clearly named test-mode/stub boundary.
- Do not introduce a second domain model or seed-data authority for the frontend.

## Acceptance criteria

- Each first-slice field and operation traces to a current model, approved decision, or explicit proposal.
- Service ownership and source-of-truth behavior are unambiguous.
- GraphQL-to-REST mapping and errors are documented with examples.
- Deterministic seed fixtures and contract tests are specified.
- Open decisions are listed with owners, impact and default recommendation; no silent invention.
- Frontend and service agents can implement against this artifact without independently redefining shared shapes.
