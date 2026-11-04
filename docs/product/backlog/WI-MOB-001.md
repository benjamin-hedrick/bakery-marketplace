> **Status:** In review · built and run locally 2026-11-04 (four Maestro flows pass on the emulator, `docs/evidence/WI-MOB-001/`); waiting for the lead's review of the auth changes (the issuer redirect rule, the token handling in the app) and decision on pushing; ADR-0023 accepted 2026-11-04

```
WI ID:               MOB-001
Title:                Customer mobile app (Android, Expo) with Maestro flows
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  EPIC-QUALITY-EVIDENCE
Hat/Owner:            Engineering/Build
Status:               In review
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
- [x] Allergen acknowledgement in the cart: not built, the BFF does not require it to place an order; follow-up in register 146.
- [ ] How the app is started in the demo script (`scripts/dev/demo.mjs`), if at all: not done; the app runs through `scripts/dev/mobile-flows.mjs` and `apps/mobile-customer/README.md`.

**As built (2026-11-04)**
- `apps/mobile-customer`: Expo SDK 58, React Native 0.88, TypeScript, Android only. Login, menu with stock, item with options, order (cart), checkout (pickup window optional, idempotency key per content, a rejection spends the key), order status (polled every 5 s), logout. Plain `fetch` to the BFF (`src/api.ts`), no Relay.
- Sign-in as in ADR-0023 (its "What has been built" section lists each decision against the code). Issuer change: `tools/BakeryMarketplace.Auth/MockOidcIssuer.cs`, registered in `docker-compose.yml`.
- Flows: `apps/mobile-customer/.maestro/` (four flows and a login subflow), run by `node scripts/dev/mobile-flows.mjs` (boots the emulator if needed, starts the same stack as `scripts/dev/mobile-stack.mjs`, builds, installs, runs, tears down). Result: `docs/evidence/WI-MOB-001/`.
- Gates: format and typecheck of the app and of `packages/customer-core` are in `node scripts/ci/node-gates.mjs`; the Maestro flows are not in the pipeline (register 148).

**Changes from the original plan**
- **Shared package built (approved by the lead 2026-11-04).** The spec said sharing code with the web app by extracting a package needed approval; it was given, and the cart, checkout input and the allergen, diet and order wording moved from `apps/web-customer` to `packages/customer-core` (66 unit tests moved with it; the web app's 132 browser tests stayed green).
- **The debug build embeds its bundle** instead of loading it from Metro (register 147), through `apps/mobile-customer/plugins/withEmbeddedBundle.js`.
- **The decline switch is a build option** (`EXPO_PUBLIC_TEST_HOOKS=1`), not a debug-build feature, so the embedded-bundle build can have it.
- **A network failure does not log the customer out** (the refresh token is deleted only when the issuer refuses it).
- Not done: the allergen acknowledgement (register 146), the demo-script start, a repeat run for flakiness.
