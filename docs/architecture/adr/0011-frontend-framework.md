# ADR-0011: Frontend Framework — React (Vite) SPA

**Status:** Accepted

## Context

Container hosting for the frontend was already decided (`tech-stack.md`: Azure Static Web Apps, permanent free tier), but nothing ever decided *what runs inside it*. `apps/web-customer/README.md` (and the other two frontend apps) remained "scaffold only." This is the same shape of gap ADR-0010 closed for the backend — every frontend work item's acceptance criteria needs a concrete language/framework to be real, not language-neutral pseudocode.

Surfaced while scoping the first customer-facing work items (`WI-WEB-001` onward), the same way ADR-0010 was surfaced by needing real C# signatures.

## Decision

**React SPA via Vite**, hosted on Azure Static Web Apps (already confirmed), calling backend services directly at their local/deployed origins per ADR-0008 (no server-side rendering, no meta-framework). Applies to `web-customer`, `web-admin` (when built), and `web-queue-display`.

- **Auth**: Authorization Code + PKCE against the local mock OIDC issuer (`AUTH-005`, revised — see amendment to ADR-0006) locally, and against Microsoft Entra External ID in deployed environments — same config-driven Authority/Audience swap posture as the backend (ADR-0006's amendment note).
- **Token storage**: access token held in memory only, never `localStorage` or a cookie — consistent with ADR-0006's header-only bearer-token posture. No refresh-token handling in v1 (see Consequences and the open item below).
- **No shared npm package extracted yet** for `web-customer`/`web-queue-display`'s common scaffold/auth pattern — deliberately not building the abstraction before a second real instance (`web-admin`) exists to justify it, same discipline as elsewhere in this project (e.g., not centralizing resource-ownership checks until resource-type complexity grew — ADR-0006 Open Item #8).

## Consequences

**Positive**
- Recognizable, high-demo-value stack for a portfolio project's reviewing audience
- First-class Static Web Apps support, no hosting rework needed
- React's ecosystem (component composition, conditional rendering) fits the allergy-flag/modifier-highlighting UX that's the actual product differentiator (vision principle 1) better than a thinner stack would

**Negative / accepted limitations**
- Introduces a second toolchain (npm/Node) alongside the .NET backend, where Blazor WebAssembly would have kept one language end-to-end — accepted, a direct tradeoff of demo-recognition value over toolchain uniformity.
- **No refresh-token / silent-renewal flow in v1.** Token expiry means a full re-login, not a background refresh. Acceptable for a local demo and short-lived sessions; a real production frontend would need this. Named explicitly here rather than left implicit — see the open item below and the parking-lot entry.
- No shared component/auth package between apps yet — some near-term duplication between `web-customer` and `web-queue-display`'s scaffolds, accepted until a third real instance (`web-admin`) justifies extraction.

## Alternatives considered

1. **Blazor WebAssembly.** Rejected for v1 — same language as the backend end-to-end is a real, considered benefit, but a smaller demo-recognition signal for a typical hiring audience, and this project's differentiator (dietary-safety UX) benefits more from React's component ecosystem than from language uniformity.
2. **Plain HTML + minimal JS/HTMX.** Rejected — fastest to ship, but too thin for the allergy-highlighting/filtering interactions that are the actual product differentiator (vision principle 1); would require reinventing state/interaction handling ad hoc.
3. **A meta-framework (Next.js, Remix) with SSR.** Not seriously considered — no SEO or first-paint requirement exists for a pickup-based, logged-in-experience app; SSR would add deployment complexity to Static Web Apps hosting without a corresponding benefit here.

## Related

- ADR-0010 — same shape of decision (language/framework), backend layer
- ADR-0008 — confirms frontend calls services directly, no gateway, locally
- ADR-0006 (amendment below) — the mock issuer's expanded scope this ADR's auth choice depends on
- `docs/governance/open-items-register.md` — new entry for the no-refresh-token limitation
