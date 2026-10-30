# ADR-0008: API Gateway — Azure API Management (Consumption Tier), Zero-Trust Dual Validation

**Status:** Accepted, amended 2026-10-26

## Context

Three frontend apps (`web-customer`, `web-admin`, `web-queue-display`) need to reach four backend services (`catalog`, `ordering`, `notification`, `admin`). Whether that goes through a gateway or direct-to-service was never decided when ADR-0006 was written — ADR-0006 implicitly assumed direct-to-service, since each service validates its own JWT with no mention of an intermediary. This ADR resolves that gap.

Azure Front Door and Application Gateway were both ruled out early — neither has a meaningful free tier (Front Door Standard alone has a $35/month base fee regardless of usage). The real choice was between Azure API Management (Consumption tier — 1,000,000 free calls/month, permanently, pay-per-call above that) and a self-hosted, thin BFF on Container Apps (already free, already in the stack, no new managed service).

## Decision

**Azure API Management, Consumption tier**, as the single entry point for all three frontend apps.

**Zero-trust dual validation — APIM does not replace ADR-0006, it front-runs it.** APIM applies the `Validate JWT` policy (confirmed supported on Consumption tier) as a fast-fail check plus coarse role-based routing (e.g., only route to `admin-service` if the role claim includes `Admin`). This is an edge-level optimization, not the authoritative check — **every service still independently and fully validates the JWT and performs its own resource-ownership check, exactly as ADR-0006 specifies, unchanged.** If APIM is ever bypassed, the request still hits full service-level auth; the only thing lost is the fail-fast/coarse-routing benefit, not the security boundary itself.

**Rate limiting is only partially absorbed by the gateway, not fully.** APIM Consumption supports `rate-limit` (by subscription) but explicitly **not** `rate-limit-by-key` — the policy needed for per-end-user or per-content rate limiting. Concretely: coarse, per-registered-frontend-app throttling can live at the gateway; the per-user, per-review, and per-ad-impression abuse-prevention concerns in `EPIC-RATE-LIMITING` **stay at the service layer**, they are not replaced by this decision.

**No VNet/Private Link on Consumption tier — accepted, not worked around.** Private Link/VNet integration is only available on Developer, Basic, Standard, and Premium tiers. This means "APIM is the only way in" is a convention, not a network-enforced guarantee. This is accepted specifically because zero-trust dual validation already means a bypass doesn't compromise auth — only the edge optimizations are lost.

**No self-hosted gateway on Consumption tier — accepted, not worked around.** The self-hosted gateway (a real container running APIM's gateway logic, which would give true local parity) requires Developer or Premium tier. Upgrading tier just to get this would cost ~$48/month and still carry no SLA, undercutting the entire reason Consumption was chosen. Not pursued.

**Local development — three-part approach, none of which requires paying for a higher tier:**
1. **Skip the gateway locally**, call services directly. Safe under zero-trust dual validation, since auth enforcement is fully replicated at the service layer regardless of whether APIM is in the path.
2. **A thin local reverse-proxy stand-in** (a small Caddy/YARP/Nginx config as a Compose service) mirroring APIM's path-based routing rules, so frontend code talks to the same URL shape locally and in the cloud. This gives structural/routing parity, not policy parity.
3. **Policy-as-code, tested against a real shared dev-tier APIM instance, not a local emulator.** This mirrors ADR-0005's Stripe approach exactly (no local emulator there either — test mode against the real cloud service via the CLI). Policy XML/config is versioned in the repo; a **static policy-config lint** (parses the policy file, asserts expected routes/policies are present — e.g., "every route except `/health` has the JWT-validation policy attached") runs in CI with no live instance required, catching the most common mistake (a forgotten policy on a new route) cheaply.

## Consequences

**Positive**
- Free at this project's scale (1,000,000 calls/month, permanently)
- Single entry point simplifies CORS across three frontend apps
- Coarse edge-level auth fail-fast and routing, without disturbing ADR-0006's authoritative model
- Doesn't require paying for a higher tier to get an acceptable local-dev story

**Negative / accepted limitations**
- No network-level enforcement that APIM is the only path in — accepted because zero-trust dual validation means a bypass loses optimizations, not security
- Gateway policies are not laptop-testable — only testable against a real (shared, low-volume) cloud dev instance, a genuinely different testing story than anything else in this project
- `rate-limit-by-key` isn't available on Consumption tier, so `EPIC-RATE-LIMITING`'s actual per-user/per-content abuse-prevention concerns remain fully a service-layer responsibility — APIM only adds a coarse, complementary layer, it does not let that epic shrink
- A new policy-authoring surface (APIM's XML-based policy language) with no precedent pattern from the rest of this project — the adapter/contract-test/chaos pattern used for cache/events/data doesn't extend here, similar to the departures already noted in ADR-0005 and ADR-0006

## Alternatives considered

1. **Azure Front Door or Application Gateway.** Rejected — no free tier; Front Door Standard alone is a $35/month minimum regardless of usage.
2. **Self-hosted, thin BFF on Container Apps.** A real, still-reasonable alternative — already free, full local-dev parity (it's just another container), no new policy language, no VNet limitation to reason about. Not chosen because APIM's policy governance, versioning, and developer-portal story is a stronger architecture artifact, and the identified gaps (above) are all mitigated, not blocking. Worth revisiting if the mitigations prove costlier in practice than expected during actual build.
3. **Upgrade to Developer tier for the self-hosted gateway (full local parity).** Rejected — costs ~$48/month, still no SLA, and undercuts the entire reason Consumption was attractive in the first place.
4. **APIM as the sole authoritative auth boundary, dropping per-service validation.** Rejected per the zero-trust principle — this would turn "APIM bypassed" from "lost an optimization" into "lost all auth enforcement," which is not an acceptable tradeoff.

## Related

- ADR-0006 — unchanged; this ADR adds an edge-level optimization in front of it, not a replacement (a short cross-reference note added to ADR-0006 pointing here)
- ADR-0005 — same local-parity shape (test against a real cloud instance, no local emulator)
- `tech-stack.md` — resolves the API Gateway row
- `docs/governance/open-items-register.md` — resolves Open Item #20
- `EPIC-RATE-LIMITING` — clarifies the gateway only partially overlaps with this epic's scope

## Amendment note (ADR-0013 — GraphQL BFF, 2026-10-26)

ADR-0013 adopts Alternative 2 above (a self-hosted BFF on Container Apps), **in addition to APIM, not instead of it**:
- **Browser apps no longer call APIM or the services directly.** Their single API entry point is the GraphQL BFF.
- **APIM stays the gateway for service APIs.** In the cloud, the BFF calls the C# services through APIM, so the `Validate JWT` fast-fail and coarse role routing still apply. Locally, the BFF calls services directly (point 1 under "Local development" above).
- **Zero-trust dual validation is unchanged.** The BFF forwards the caller's bearer token; every service still fully validates it (ADR-0006).
- **The local reverse-proxy stand-in (point 2 under "Local development", `GW-005`) is no longer needed.** Its purpose was URL-shape parity for frontend code, and frontend code now only talks to the BFF.
- The "single entry point simplifies CORS across three frontend apps" benefit now comes from the BFF rather than APIM.
