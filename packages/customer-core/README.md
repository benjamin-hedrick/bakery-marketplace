# customer-core

The customer's rules and wording, as plain TypeScript with no framework: the cart and its totals, the checkout input, allergen and diet wording, conflict
marks, stock checks on adding, order cancelling, the order-status poller, payment-method choice and money formatting. `apps/web-customer` and
`apps/mobile-customer` both use it, so the web and Android apps say the same thing the same way (`WI-MOB-001`).

It holds wording and client-side presentation rules only. Prices, availability, allergen checks and order state are decided by the C# services; this
package never decides them (ADR-0012).

```
npm ci
npm run typecheck
npm test          # node --test, no Docker needed
```

Run `npm ci` here before `npm ci` in either app. The tests are part of `node scripts/ci/node-gates.mjs --tests`.
