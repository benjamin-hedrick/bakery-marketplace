> **Status:** Ready · evidence: none yet

```
WI ID:               NOT-002
Title:                Notification templates for the order lifecycle
Type:                 Service Implementation
Epic:                 EPIC-NOTIFICATIONS
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Ready
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
