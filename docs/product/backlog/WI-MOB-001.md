> **Status:** Ready · written 2026-11-04 after the Maestro/Android spike; waits for the lead to accept ADR-0023 (sign-in) before any auth code

```
WI ID:               MOB-001
Title:                Customer mobile app (Android, Expo) with Maestro flows
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  EPIC-QUALITY-EVIDENCE
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 L
```

**Context / Why**
The repo has no mobile client and no Maestro flow (gap `T-35`; the biggest hole against the "mobile testing" goal). The spike (`WI-QA-003`, 2026-11-04) showed that Maestro 2.12.1 runs against the web app (Beta) and an Android emulator runs here. The lead decided: build a thin Expo client, Android only, local only, with login, browse, cart and checkout, and order status.

**Inputs / References**
- *Decisions*: ADR-0023 (native sign-in), ADR-0013/0014 (BFF; nothing cached for orders or carts), ADR-0006/0008 (services validate tokens), ADR-0019 (refresh grant).
- *Interfaces*: the GraphQL BFF (`services/graphql-bff/schema/schema.graphql`), as the web app uses it; the web app's cart and checkout behaviour (`apps/web-customer`) is the reference for what the screens do, not code to share.

**You do not need to know about**
Relay, the Next.js app's server session, the vendor queue, personalization screens (tags, preferences, allergens: the app shows the stock and the listing as the public views give them; allergen acknowledgement at the cart is **in scope only if the cart check the BFF exposes requires it to place an order**, else a follow-up item).

**Out of scope**
iOS, real devices, push notifications, store builds, any deployment, CI for the mobile flows (local only), sharing code with the web app by extracting a package (needs the lead's approval first).

**Requirements / Acceptance Criteria**
- `apps/mobile-customer`: Expo (TypeScript), debug build installable on the `bakery_pixel` emulator; `README.md` with the commands.
- Sign-in per ADR-0023; logout; the app survives restart without a new login (refresh token) and goes back to the login screen when the refresh fails.
- Screens: login, listings with stock, listing detail with options, cart (quantities, remove), checkout (pickup window, place order with an idempotency key; a declined or failed payment shows a clear message and keeps the cart), order status for the order just placed.
- Maestro flows in `apps/mobile-customer/.maestro/`: login, browse to detail, add to cart, checkout, see the order status; logout; plus one failure flow (declined payment keeps the cart). They run on the emulator against the local stack (`docs/operations/local-dev.md`), and one command runs them.
- Results recorded under `docs/evidence/WI-MOB-001/` with the date, versions and what was not run; Maestro web (Beta) result from the spike recorded in `WI-QA-003`.
- Anything found and not fixed goes into the register in the same change.

**Dependencies**
- Blocked by: acceptance of ADR-0023; the issuer redirect-rule change and its tests.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes for the app and the flows; the issuer rule and the token handling are reviewed by the lead.

**Open Points (working)**
- [ ] Allergen acknowledgement in the cart (see above).
- [ ] How the app is started in the demo script (`scripts/dev/demo.mjs`), if at all.
