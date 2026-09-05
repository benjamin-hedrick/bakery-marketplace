# ADR-0005: Payments — Buy (Stripe Connect) Rather Than Build

**Status:** Accepted

## Context

The marketplace needs to: charge customers, split funds between platform commission and vendor payout at the point of sale, onboard vendors for payout eligibility, and handle basic refunds — while keeping PCI compliance scope and financial-regulatory burden as small as possible for a portfolio-scale project. `tech-stack.md` already flagged payments as a generic subdomain and a buy-over-build candidate.

Building this ourselves would mean owning card tokenization (and the accompanying PCI-DSS SAQ D compliance scope), a ledger for commission splits, vendor KYC/identity verification, payout scheduling, and — for real-world credibility — tax-form generation (1099s) for US vendors. None of this is differentiating for this product; all of it is well-solved by existing marketplace-payment platforms.

## Decision

**Stripe Connect**, using **Express accounts** for vendors (Stripe hosts the onboarding/KYC flow; Custom accounts were considered and rejected — see Alternatives).

- **Checkout**: customer card entry uses Stripe.js/Elements (or the Stripe Payment Element) so raw card data never reaches our servers — this keeps us in the **SAQ A** PCI compliance tier rather than SAQ D. This is the actual justification for buy-over-build, not just "it's a payments company."
- **Commission split**: destination charges with `application_fee_amount` — Stripe splits the commission and the vendor's share automatically at charge time; we don't run our own settlement logic.
- **Vendor onboarding for payouts**: Stripe's hosted Express onboarding flow handles identity verification and bank-account linking; our Vendor Onboarding context (ADR-0004's `vendors` container) stores only the resulting Stripe-connected-account ID and its status, not raw KYC data.
- **Payout scheduling**: handled by Stripe's own payout scheduling to the vendor's connected account, not built by us.
- **Our `payouts` container is a reconciliation read-model, not a source of truth.** Stripe is the system of record for actual money movement. Our container is populated by consuming Stripe webhooks and exists for our own UI/reporting — this doesn't contradict ADR-0004's Strong-consistency choice for that container; it just clarifies what that container actually represents.
- **Webhooks are at-least-once delivery**, same characteristic as the domain event backbone in ADR-0003. Webhook handlers dedupe on Stripe's event ID, reusing the same idempotency pattern rather than inventing a new one.
- **Tax reporting**: Stripe Connect Express automatically handles US 1099 generation for connected vendors — a concrete example of something that would be genuinely painful to build correctly ourselves, reinforcing the buy decision beyond convenience.

**Explicit v1 scope cuts** (named, not silently dropped):
- Refunds: basic refund initiation via the Stripe API only. Chargeback/dispute-handling workflows are deferred.
- Currency/region: single currency (USD), single region (US) assumed for v1. No multi-currency/FX handling.

**Local development**: Stripe's test mode plus the Stripe CLI (`stripe listen --forward-to`) forwards real webhook events to a local endpoint, using Stripe's own test fixtures — no emulator needed, and no Azure dependency at all for this piece, since it's an external SaaS integration regardless of environment.

## Consequences

**Positive**
- PCI compliance scope stays minimal (SAQ A) by never touching raw card data
- Commission-split logic, payout scheduling, vendor KYC, and 1099 generation are all handled by a platform built specifically for marketplace payment flows, not reimplemented
- Local dev/testing has a real, low-friction story (Stripe test mode + CLI) without needing a local emulator or Azure-specific tooling

**Negative / accepted limitations**
- Express accounts mean Stripe controls the vendor onboarding UI/branding — less control than Custom accounts would offer, accepted as a reasonable tradeoff of build effort vs. control for this scope
- Chargebacks/disputes are a real operational concern for any marketplace and are explicitly deferred here, not solved — worth a line in the risk register
- Single-currency/single-region assumption means this design would need real rework (not just configuration) to support international vendors or customers
- We are dependent on an external SaaS platform's uptime and API stability for a core transactional flow — an accepted tradeoff given the alternative (building and maintaining PCI-scoped infrastructure ourselves) is a much larger and riskier undertaking for this project's scale

## Alternatives considered

1. **Stripe Connect Custom accounts** instead of Express. Rejected for v1 — Custom gives full UI control but shifts KYC/compliance/1099 responsibility largely back onto us, which is exactly the burden buy-over-build is meant to avoid.
2. **Build our own ledger + a plain payment gateway (e.g., Authorize.net) without Connect's marketplace features.** Rejected — would require building commission-split logic, payout scheduling, and vendor KYC ourselves, and would place us in full PCI-DSS SAQ D scope. This is the "build" option and it's a materially larger undertaking with no differentiating value.
3. **Adyen or Braintree** instead of Stripe. Considered — both are credible marketplace-payment platforms with similar Connect-equivalent features. Stripe chosen primarily for documentation quality and developer-experience fit for a portfolio project; this is a reasonable place to substitute a different real-world vendor without changing the ADR's core reasoning.
4. **No payments in v1 at all (mocked/fake checkout).** Rejected — payments are central enough to the marketplace story (commission model, vendor payouts) that faking them entirely would undercut the product's core value proposition rather than just deferring a peripheral feature.

## Related

- `tech-stack.md` — resolves the "Pending ADR" payments row
- ADR-0004 — `payouts` container's role as reconciliation read-model, not source of truth
- ADR-0003 — webhook idempotency reuses the same at-least-once/dedupe pattern as the event backbone
- Risk register — chargeback/dispute handling should be logged as an accepted, deferred risk
