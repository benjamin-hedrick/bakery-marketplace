> **Status:** In review · built and run locally on `feature/slice-personalization-web` (2026-11-04); real-stack journeys passed on a clean stack (2026-11-04)

> **Outcome note (2026-11-04):** built as specified. The queue board's list query and the live subscription both ask for `allergens` (a pushed order replaces a listed one, so the two carry the same fields; TypeScript checks it). The labels come from one `tags(kind: ALLERGEN)` read per screen; if it fails the cards show the ids. A card with allergens shows a bold line with a warning icon, `Allergy: tree nuts, sesame`, and an accessible name `Order ABC123. Allergy: tree nuts, sesame`; a card without allergens is exactly as before (it never says "no allergies"). Per the lead's decision (2026-11-04) the allergens stay on the card through every active status including Ready, so the bakery can label or stage the order; nothing is logged by the screen.
>
> **Verified (local):** 5 unit tests of the wording and the stream merge (38 in all), 7 browser tests against the mock BFF (with and without allergens, the accessible name, one registry read, an unknown id, an unreadable registry, an order arriving by the stream and moving to Ready, axe smoke; 60 in the suite, all passing); a mutation check (unknown ids dropped) failed the intended unit test. **Real stack (2026-11-04, passed):** `tests/skeleton/queue-allergens.spec.ts` ran in the full `skeleton-smoke.mjs --containers` run on a clean stack (55 of 55 journeys passed).
>
> **Changes from the original plan:** none to the design. **Not done / limits:** the real-stack check that another vendor's screen does not show the order is covered at the API in `order-allergens.spec.ts` (the mock issuer has one vendor login).

```
WI ID:               QUE-005
Title:                Allergens on the vendor's order card
Type:                 Service Implementation
Epic:                 EPIC-QUEUE-DISPLAY
Shared with epic(s):  EPIC-PREFERENCES
Hat/Owner:            Engineering/Build
Status:               In review
Size:                 S
```

**Context / Why**
An allergen recorded on an order (`ORD-009`) only helps if the person preparing it cannot miss it. The vendor's live queue is where the order is read.

**Inputs / References**
- *Decisions*: ADR-0021 (the stream carries the whole changed order), ADR-0022 (labels come from the public registry), NFR 3.7.
- *Interfaces*: `VendorOrder.allergens` (`ORD-009`), the BFF `tags` query (`TAG-001`), the queue display's order card and detail.

**You do not need to know about**
- How the allergens were chosen or stored.

**Out of scope**
- Acting on allergens (blocking or confirming differently); notifying anyone.

**Requirements / Acceptance Criteria**
- An order with allergens shows them on its card and in its detail as a distinct, plain label ("Allergy: tree nuts, sesame"), in text with an icon, never colour alone, and in the accessible name of the card. An order without allergens shows nothing extra (the card does not say "no allergies", which would claim more than it knows).
- They arrive with the order, in the list, the single read and the live stream, with no extra read per order; labels come from the public `tags` registry fetched once per screen, and an id the registry does not know is shown as its id, never dropped.
- They are part of what the screen shows while the order is in progress, and nothing about them is logged by the screen.
- **Tests:** against the mock BFF (with and without allergens, an unknown id, an update arriving by the stream, the accessible name) and on the real stack (an order placed with an allergen shows it on the vendor's screen, another vendor's screen does not).

**Dependencies**
- Blocks: none.
- Blocked by: `ORD-009`, `TAG-001`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes.

**Open Points (working)**
*(none currently)*
