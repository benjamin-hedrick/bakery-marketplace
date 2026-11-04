> **Status:** Ready

```
WI ID:               QUE-005
Title:                Allergens on the vendor's order card
Type:                 Service Implementation
Epic:                 EPIC-QUEUE-DISPLAY
Shared with epic(s):  EPIC-PREFERENCES
Hat/Owner:            Engineering/Build
Status:               Ready
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
