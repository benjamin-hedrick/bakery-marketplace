# Personas / Jobs-to-be-Done

One persona per actor already defined in `docs/architecture/ddd/glossary.md`. Courier is correctly not included — a v2/deferred actor per ADR-0001, not yet real.

## Customer — "Dana, the careful orderer"

**Goals**: find bakery/coffee options near her that are actually safe for her son's nut allergy, without having to call ahead or interrogate a cashier every time.
**Pain points**: generic delivery apps don't surface allergen info reliably, and small local shops often don't have any online ordering at all — she's stuck choosing between convenience and safety.
**JTBD**: *When I'm ordering food for my family online, I want allergy information to be impossible to miss, so I can order confidently without a phone call to double-check.*
**Connects to**: vision principle 1 (dietary safety first-class), the Preferences & Dietary Safety bounded context, the north-star safety metric in the glossary.

**Served today (2026-11-08):** Customer: can browse listings with allergen flags, tags and stock states, save an allergen profile and see conflicts, acknowledge allergy warnings at checkout, order with a saved test payment method, watch and cancel the order and see the order history, on the web and on Android.

## Shop — "Marcus, the neighborhood bakery owner"

**Goals**: reach more customers online without adopting an enterprise POS system he doesn't have time to learn, and see incoming orders the moment they're placed so his kitchen isn't caught off guard.
**Pain points**: existing delivery platforms take a large cut and weren't built with a small bakery's actual workflow in mind — he wants something that fits how his counter and kitchen already operate.
**JTBD**: *When a customer places an order, I want to see it on my counter display immediately, so I can start preparing it without checking a phone or tablet constantly.*
**Connects to**: the live order-queue display (`EPIC-QUEUE-DISPLAY`), the event-driven backbone that feeds it (ADR-0003).

**Served today (2026-11-08):** Shop: has a live order-queue screen with accept, decline, start, ready, hand over and cancel, showing each order's allergens, and API endpoints for listings and stock. There is no screen for managing listings and no onboarding flow.

## Independent Vendor — "Priya, the home baker"

**Goals**: turn her cottage-food baking hobby into real, legitimate income, without navigating a maze of compliance paperwork alone.
**Pain points**: most marketplaces are built for established businesses, not home-based sellers — verification processes that don't account for her situation, or platforms that don't take home bakers seriously as a category at all.
**JTBD**: *When I want to sell my baking to real customers, I want a clear, guided verification process built for someone like me, so I can start selling without feeling like an afterthought on a platform designed for someone else.*
**Connects to**: the Vendor Onboarding & Verification context explicitly modeling `VendorType` (Shop | Independent) as a first-class distinction, not a bolted-on edge case (vision principle 3, glossary).

**Served today (2026-11-08):** Independent vendor: exists as a seeded vendor with the same API. There is no onboarding or verification flow; verification is simulated by an event the seed script publishes.

## Admin — "Sam, the platform moderator"

**Goals**: keep the marketplace trustworthy — verified vendors, appropriate listings — without a workload that scales linearly with every new vendor signup.
**Pain points**: verification and moderation queues that require deep context-switching between systems, or that don't surface the right information (compliance status, prior flags) at the point of decision.
**JTBD**: *When a new vendor applies, I want everything I need to verify them in one queue, so I can make a confident decision without hunting across systems.*
**Connects to**: `EPIC-ADMIN`'s verification queue UI, the Admin/Moderation context's role as a thin read-model consumer (bounded context map) — designed to aggregate what Sam needs, not make him assemble it himself.

**Served today (2026-10-30):** Admin: nothing is built (`admin-service` is an empty scaffold).
