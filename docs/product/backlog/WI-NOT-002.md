> **Status:** In review · built and run locally on `feature/slice-notifications` (2026-11-03); evidence: the Outcome note below; `services/notification-service`

> **Outcome note (2026-11-03):** built. `TemplateMessageComposer` replaces the placeholder: one template per order event (placed, confirmed automatically or accepted by the vendor, preparation started, ready for pickup, completed, cancelled), plain text, filled from the payload only. The order is shown by its short reference (the last six characters, upper case, as the vendor sees it). Optional fields (total with currency, the pickup window with the offset the order carries) drop their sentence when absent. The cancellation reason is a code with fixed wording per value, and an unknown value gets a generic sentence. **Pickup instructions are left out** (free text that may hold personal data), and **no vendor name is shown** because no order payload carries one. An event type with no template throws instead of sending an empty message.
>
> **Verified (local):** 16 template tests (exact text for the placed message, variants for the optional fields, every cancellation reason, offsets and multi-day windows, instructions never copied, a missing name, and a check that the subscribed event types equal the templated ones, so a new event type fails the build until it has a template) and an end-to-end test of a placed-to-completed sequence through the real host producing the five expected messages in order. A mutation (swapping the automatic and accepted wording) failed a test. The service now has 42 tests.
>
> **Not done:** no check against the ordering service's list of event names (the two services are separate; the list is copied); no HTML or localisation; the allergy warning and low-stock alert are register item 138.

```
WI ID:               NOT-002
Title:                Notification templates for the order lifecycle
Type:                 Service Implementation
Epic:                 EPIC-NOTIFICATIONS
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               In review
Size:                 S
```

> **Changes from the original plan (2026-11-03):** the catalog listed three templates: order confirmation, allergy warning and low-stock alert. Only the order-lifecycle family is built here. The allergy warning needs preference and allergy data (personalization, not built) and the low-stock alert needs a stock event from the catalog that is not published. Both are tracked in register item 138.

**Context / Why**
`NOT-001` receives events and sends through an adapter; this item decides what each message says.

**Requirements / Acceptance Criteria**
- One template per event: order placed, confirmed (automatic or by the vendor), preparation started, ready for pickup (with the pickup window and place from the payload), completed, and cancelled (by customer, vendor or system, with the reason's customer-safe wording).
- Templates are plain text with named fields filled from the event payload only (order short code, vendor name if present in the payload, pickup window). Missing optional fields drop their sentence rather than printing a blank.
- Customer-supplied or vendor free text is never copied into a message unescaped; the cancellation reason uses the fixed wording per enum value.
- Snapshot tests for each template and each optional-field variant; a test that every order event type has a template, so a new event type fails the build until one is added.
- Wired into `NOT-001`'s handlers; an end-to-end test shows a checkout-to-completed sequence producing the expected messages in the recording sender.

**Out of scope**
- Allergy warning and low-stock alert (register item 138); localisation; HTML or rich layouts.

**Dependencies**
- Blocked by: `NOT-001`
