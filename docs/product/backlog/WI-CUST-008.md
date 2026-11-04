> **Status:** Ready

```
WI ID:               CUST-008
Title:                Allergens in the cart and at checkout: show them, warn, and tell the bakery
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  EPIC-PREFERENCES
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 M
```

**Context / Why**
Vision principle 1 says allergy information is surfaced at "browse, customization and cart". Today the checkout form shows no allergens at all (`docs/product/okrs.md` KR1.1: 3 of 4 touchpoints), and nothing warns a customer whose cart contains something they listed. The warning is only useful before the order is placed, where it can still change the decision; and the bakery should be able to know about the customer's allergies for **this** order (`ORD-009`, `QUE-005`).

**Inputs / References**
- *Decisions*: ADR-0022, NFR 3.7, vision principle 1, `docs/product/okrs.md` (KR1.1, KR1.3 and its definition: constraints "recorded on" the order), register 138 (the e-mail warning is dropped).
- *Interfaces*: the BFF `cartCheck` (`SRCH-001`), `preferences` (`PREF-001`), `placeOrder`'s new `allergens` input (`ORD-009`), `CheckoutForm` and the cart.

**You do not need to know about**
- How the check is computed (`SRCH-001`) or stored on the order (`ORD-009`).

**Out of scope**
- Blocking an order; a server-side refusal at checkout (the warning is advice, the customer decides); diet preferences.

**Requirements / Acceptance Criteria**
- **For everyone** (logged in or not, with or without a profile): every cart line shows the allergens of its item and of the options chosen, from the listing data the form already reads, in the same plain words as the detail page. This closes KR1.1.
- **With a profile:** above the "Place test order" button the form asks `cartCheck` for the cart's lines. A line with a conflict shows a warning that names the line, the allergen and, when it comes from an option, the option ("Almond Croissant contains tree nuts, which you listed as an allergy"). `allergy` conflicts read as a warning and `avoid` ones as a note. The check re-runs when the cart changes.
- **Acknowledgement:** when any `allergy` conflict is present, a checkbox ("I have read this and still want to order") must be ticked before the order is placed. It does not block anything else, and `avoid` conflicts need no acknowledgement.
- **If the check cannot be made** (the service is down, the login ended), the form says so plainly ("We could not check this order against your allergies") and still lets the customer order; the failure is not silent and is not shown as "no conflicts".
- **Tell the bakery** (needs `ORD-009`): a control, on by default when the profile has allergies, lists the customer's `allergies` for this order; the customer may untick any (for example when ordering for someone else) and the chosen allergens are sent with the order. The wording says what the bakery will see ("The bakery will see these allergies with your order"). Nothing is sent when the control is off or the list is empty. The `avoid` list is never sent.
- **Tests:** against the mock BFF (allergens on lines for a logged-out customer; each severity; an option-only conflict; the acknowledgement gating; the failed check; the control and what `placeOrder` is sent) and on the real stack (the croissant against a tree-nut allergy: the warning, the acknowledgement, the order placed, the allergens on the order).

**Dependencies**
- Blocks: none.
- Blocked by: `SRCH-001`, `CUST-005` (soft), `ORD-009` (the "tell the bakery" control only; the rest can be built first).

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes, with the lead's review of the wording and of letting the customer proceed when the check fails.

**Open Points (working)**
- [ ] Whether an unticked acknowledgement should block the button or only mark the form. Proposed: it blocks (a serious conflict deserves one deliberate action), and nothing else does.
