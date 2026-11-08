# Vision One-Pager

> **Status:** Current · the principles were written 2026-09-07 and have not changed; the section "Where the product stands" is dated 2026-10-30 and is read against the code on 2026-11-08 in [scope](scope.md).

## Problem

Generic delivery marketplaces optimize for speed and coverage, not for trust and discovery. Customers with allergies or specific dietary preferences face real friction — and real risk — ordering from small local bakeries and coffee shops that don't run sophisticated systems. Meanwhile, small shops and home-based food makers have no accessible path to reach these customers online without adopting a heavyweight POS or delivery-platform stack built for a different problem.

## Who it's for

- **Customers with dietary constraints** (allergies, preferences) who want to discover and order from local bakeries/coffee shops safely and confidently
- **Small shops** (bakeries, coffee shops) who want simple digital storefront, ordering, and pickup management without adopting enterprise POS tooling
- **Independent/home-based vendors** who want a legitimate, verified path to list and sell niche or homemade goods

## Value proposition

A pickup-first marketplace that puts dietary safety and preference-matching at the center of discovery, gives small and home-based vendors a low-friction path to reach real customers, and gives shop owners real-time order visibility without heavyweight tooling.

## What success looks like (feeds `okrs.md`)

- Time-to-first-order for a newly onboarded vendor
- Percentage of orders with zero allergy-related incidents (this is the north-star safety metric — see SLA)
- Order cycle time: placed → ready for pickup
- Vendor retention / repeat-listing rate

## Guiding principles

1. **Dietary safety is first-class, not an afterthought.** Allergy/preference data is surfaced at browse, at customization, and at cart — not buried in a profile page.
2. **Extensible by design.** Fulfillment, ranking, and payments are modeled so delivery, ad auctions, and other v2 capabilities can be added without reworking the core domain.
3. **Small and home-based vendors are first-class actors**, not an edge case bolted onto a shop-centric model.
4. **Ship a small, real thing before a big, theoretical one.** MVP scope beats speculative generality — see `docs/product/scope.md` for the explicit MVP line.
5. **Zero trust: no security decision relies on network position alone.** Every service authoritatively validates its own auth and authorization, regardless of what sits in front of it (a gateway, a load balancer, an internal network boundary). This was an implicit assumption from early in the project that was never written down until ADR-0008 needed it explicitly — recorded here now so it's available to justify every future decision that touches it, instead of being rediscovered piecemeal. See `docs/architecture/adr/0006-auth-authz-model.md` and `docs/architecture/adr/0008-api-gateway.md`.

## Explicitly out of scope for v1

Delivery/dispatch, B2B ingredient-supplier flow, full ad-bidding platform, multi-region scale — each documented as a deferred decision (see ADRs), not simply omitted.

## Where the product stands against these principles (read against the code 2026-11-08)

Nothing is deployed and no customer has used it, so none of the success measures above has been measured (`docs/product/okrs.md`). Against the principles, in the local build:

1. **Dietary safety first-class:** built locally and In review (2026-11-08). A closed allergen list owned by the catalog (ADR-0022), allergen flags and tags at browse and on the detail page, a customer's allergen profile, conflict warnings with an optional hide toggle on browse, detail and cart, an acknowledgement at checkout, and the allergens carried onto the order and shown on the vendor's order card, on the web and on Android (`TAG-*`, `PREF-001`, `SRCH-001`, `CUST-005` to `CUST-008`, `ORD-009`, `QUE-005`, `MOB-002`).
2. **Extensible by design:** the fulfillment seam is built and `PickupFulfillment` runs behind it as its own event consumer (events only, ADR-0001, `ORD-003`, In review); delivery is not built. Payments sit behind an interface with a named stub, judging a saved payment method's token; ad auctions are not modelled beyond a flag.
3. **Small and home-based vendors first-class:** the data model and the seed include both a shop and an independent vendor, and the vendor has a live queue screen with accept, decline, start, ready, hand over and cancel. There is no screen for managing listings and no onboarding flow (`VEN-001`, `VEN-002`).
4. **Ship a small, real thing first:** slice 1 is the small real thing; see `docs/product/scope.md`.
5. **Zero trust:** built. Every service validates tokens and ownership itself; one test gap is recorded (register item 85).
