> **Status:** In review · built and run locally 2026-11-04 (10 of 10 Maestro flows pass from a cold start, `docs/evidence/WI-MOB-002/`; 14 new customer-core tests and 10 seed tests); the lead approved the allergy wording on 2026-11-04; waiting for the lead's review of the control server's use of the sign-in flow (`scripts/lib/flow-control.mjs`); the lead added "Signed in as <name>" on 2026-11-04

```
WI ID:               MOB-002
Title:                Android app: allergens in the cart and at checkout (show them, warn, acknowledge, tell the bakery), and who is signed in
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  EPIC-PREFERENCES, EPIC-QUALITY-EVIDENCE
Hat/Owner:            Engineering/Build
Status:               In review
Size:                 M
Verification class:   V2 (new screens and a changed request) + J (an allergy warning is a safety feature). Classes are proposed in `docs/process/verification-policy.md`.
```
ADRs and NFRs affected: ADR-0022 (allergens and tags), ADR-0013 (no rules in the BFF), ADR-0014 (nothing kept on the device), ADR-0023 (the session); NFR 3.7 (dietary data is quasi-health data: the check is read fresh and never stored on the device).

**Context / Why**
Vision principle 1 puts allergy information at browse, customization and cart; `WI-CUST-008` built that for the web app and the lead decided the Android app gets it too (register 146). The customer's allergen profile is **persisted customer data held by the services** and read through the BFF with the customer's bearer token (`cartCheck`, `preferences`); the app does not store it and needs no screen to edit it. Editing the profile (the preferences, account and admin screens) is a separate concern and stays out of this item. A customer with no saved profile still sees what the bakery flagged on each line, and the app says so rather than showing "no conflicts".

**Inputs / References**
- *Decisions*: ADR-0022 (tags and allergens), NFR 3.7, vision principle 1, `docs/product/okrs.md` (KR1.1, KR1.3), ADR-0023 (the app's session), the lead's decision on `CUST-008` that the acknowledgement **blocks the Place order button until ticked** (no server-side refusal).
- *Interfaces*: the BFF `cartCheck`, `preferences` (read only), `tags` (the registry labels), `placeOrder`'s `allergens` input; `packages/customer-core` already holds the rules and wording (`cartAllergens.ts`, `conflictText.ts`, `fingerprint` and `toPlaceOrderInput` with the allergens); the web `CheckoutForm` and `useCheckoutAllergens` are the behaviour to match, not code to copy (they use Relay).
- *Environment/tooling*: `docs/evidence/WI-MOB-001/` for how the flows run; `apps/mobile-customer/.maestro/`.

**You do not need to know about**
- How a conflict is computed or stored (`SRCH-001`, `ORD-009`), the profile screens (`CUST-005`), diet tags and browse-time marks (`CUST-006`; this item covers the cart and checkout only).

**Out of scope**
- Editing the allergen profile in the app; conflict marks on the menu and detail screens; the order status screen showing what was told to the bakery (the web does not yet either); a server-side refusal.

**Requirements / Acceptance Criteria**
- **For everyone:** each cart line shows the allergens of its item and of the chosen options, from the listing data (`allergenFlags`, the options' `allergens`) with the registry's labels, in the words `customer-core` gives; a line the bakery flagged nothing on says exactly that.
- **With a saved profile:** at checkout the app asks `cartCheck` for the lines. A line with a conflict shows a warning naming the line, the allergen and, for an option, the option. An `ALLERGY` conflict needs the acknowledgement ("I have read this and still want to order") ticked before **Place order** is enabled; an `AVOID` conflict shows but needs none. The tick is cleared when the set of conflicts changes (`allergyConflictKey`).
- **With no saved profile:** the app says it has no allergy profile to check against; it never says an item is safe or free of an allergen.
- **If the check cannot be made** (service down, session ended): the screen says "We could not check this order against your allergies" and still lets the customer order; a session that ended goes to the login screen as elsewhere in the app.
- **Tell the bakery:** a control, on by default when the profile has allergies, lists them for this order; the customer may untick any; the chosen ids are sent as `allergens`, and a different choice is a different checkout content (a new idempotency key via the fingerprint).
- **Who is signed in (added by the lead, 2026-11-04):** every screen after sign-in shows "Signed in as <name>" under the header, from the token's `name` claim (the mock issuer sets it, and its id token is the access token). Display only: the app does not check the signature and decides nothing from the name (the services validate the token, ADR-0006). The name is cleaned (control characters become spaces, 80 characters at most), shown as plain text, kept in memory with the session, gone after sign-out and never stored; with no name claim nothing is shown. Unit-tested in `packages/customer-core` (`identity.test.ts`), and a flow checks it after login and after a restart.
- **Nothing kept on the device** beyond the running session (ADR-0014, ADR-0023): the check is read fresh when the cart changes.
- **Tests:** unit tests for any new logic in `customer-core` (the rules exist; add only what the app needs); Maestro flows on the emulator against the real stack with a **customer who has a saved tree-nut allergy**: the warning on the almond croissant, Place order disabled, the tick enables it, the order is placed and carries the allergen; a customer without a profile sees the lines' allergens and the "no profile" text; the check-failed path (BFF stopped or `cartCheck` refused) lets the order through with the message. The seeded profile is set through the BFF `savePreferences` by the flow's setup, not by a screen in the app.
- The Maestro evidence and the register are updated in the same change; `node scripts/ci/node-gates.mjs` passes.

**Dependencies**
- Blocked by: `WI-MOB-001` merged or its branch as the base. Parallel with `WI-MOB-003`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. The wording and gating rules are in the shared package; the lead reviews the safety wording (an allergy warning must never imply safety).

**Open Points (working)**
- [x] How a flow gives a test customer an allergy profile **Resolved 2026-11-04:** seeded mock customers (the lead rejected a run-time call). -- (a `savePreferences` call from a Maestro script, or a seeded mock user): decided at build time, the lead reviews. Needs a second mock user or a reset, because the profile persists in the local Cosmos for the life of the stack.

**As built (2026-11-04)**
- `apps/mobile-customer/src/allergens.ts` (the hook, the app's version of the web's `useCheckoutAllergens`: tags, each listing's allergens, the profile, the cart check; read fresh whenever the cart's items or options change, nothing stored), `CartScreen` (what each line contains), `CheckoutScreen` (warnings, acknowledgement, "no profile", "check failed", "Tell the bakery"; the allergens go into the order and into the idempotency fingerprint), `App.tsx` and `src/auth/session.ts` ("Signed in as").
- Shared, with unit tests, in `packages/customer-core`: `displayNameFromToken` (`identity.ts`), `profileFromPreferences`, `lineConflictsFromCheck`, `cartCheckLines` (`allergenCheck.ts`); the wording and gating rules already there from `CUST-008` are reused unchanged.
- Flows `05-allergy-warning`, `06-no-allergy-profile`, `07-allergy-check-failed`, `08-sesame-option-only`, `09-avoid-only`, `10-several-allergies` and a "Signed in as" check in `01`. **The customers' saved profiles are seed data** (`tools/BakeryMarketplace.Seed`, `SeedData.CustomerProfiles`; four mock customers Nora, Sam, Dana and Max, identities as rows in `MockUsers`; table in `docs/operations/local-dev.md`); a flow logs in as the customer whose profile it needs. `scripts/lib/flow-control.mjs` (a local server started by `scripts/dev/mobile-flows.mjs`) reads a customer's newest order and stops and starts the BFF for flow 07; it is on the review list (register 150). Result: `docs/evidence/WI-MOB-002/`.

**Changes from the original plan**
- **"Signed in as" added** at the lead's request (see the criteria above).
- **The acknowledgement hint sits under the checkbox, not under the button** (as on the web): the checkout screen is longer than the phone and the button is below the pickup times, so a hint next to it would not be seen.
- **The open point was decided twice.** First the profile was saved by the runner's control server through the BFF (`/profile`); the lead then ruled that a profile is persisted customer data and belongs in **seed data**, not in something a flow changes at run time, and that adding mock customers is data, not auth logic. The endpoint was removed and the seed now writes four customers' profiles (one case each: tree-nut allergy, sesame allergy that only an option carries, an avoid only, several at once); Alice has none. Seeding the profiles needed the seed tool to write the `preferences` container (a small addition to the seed tool, not to the services or the issuer), and three new flows cover cases that were unreachable with one customer.
- **The check-failed flow takes the BFF away** instead of failing one query; the runner's control server stops and starts it.
- **Diet matches** (`cartCheck`'s `dietMatches`, `WI-TAG-004`) are not read or shown (out of scope, as the spec says).
- **The control server was hardened** after the first passing run (it refuses browser pages and any call without its header or the right Host; tested), then reduced to two jobs (read a customer's newest order, stop and start the BFF) when the profile moved to seed data. The runner also syntax-checks every flow before starting anything.
- **Stock is a budget** of the shared stack (the croissant has 4 units): only flows 05 and 10 buy it; written in the app's README.
- Not done: the cases still listed under "Not run" in the evidence, and any accessibility check. The lead approved the wording on 2026-11-04.
