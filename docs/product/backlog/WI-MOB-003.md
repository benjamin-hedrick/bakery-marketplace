> **Status:** In progress · written 2026-11-04 at the lead's request; depends on `WI-MOB-001` (built, In review). Remaining: the three Maestro flows (refused session, failed checkout request, order edits); the unit tests are built (2026-11-05, `docs/evidence/WI-MOB-003/unit-tests-2026-11-05.md`: 24 pass, 1 todo that fails by design, register 151 and 152)

```
WI ID:               MOB-003
Title:                Android app: tests for the session logic and flows for a refused or expired session and for failed requests
Type:                 Service Implementation
Epic:                 EPIC-QUALITY-EVIDENCE
Shared with epic(s):  EPIC-WEB-CUSTOMER
Hat/Owner:            Engineering/Build, QA
Status:               In progress
Size:                 M
Verification class:   V3 (sessions and tokens). Classes are proposed in `docs/process/verification-policy.md`.
```
ADRs and NFRs affected: ADR-0023 (decisions 4 and 5 are what is tested), ADR-0019 (the refresh grant and its rotation).

**Context / Why**
`WI-MOB-001` built the app's session handling (`apps/mobile-customer/src/auth/session.ts`, `src/api.ts`: renew before expiry, refresh once on UNAUTHENTICATED, delete the refresh token only when the issuer refuses it, keep it when the issuer cannot be reached) and its four Maestro flows pass, but **none of those paths is tested**: the flows only cover a login, a restart with a valid token and a logout. The web side has this covered (`packages/web-session/tests/service.test.ts`: renewal, one renewal under concurrency, a refusal ends the session, a 5xx is an outage not a refusal; the browser test of a refused renewal; the issuer's `RefreshTokenGrantTests`). The app is where the gap is, and token handling on a device is the part the lead will review.

**Inputs / References**
- *Decisions*: ADR-0023 (decisions 4 and 5), ADR-0019 (the refresh grant), register 145 and 148, `docs/evidence/WI-MOB-001/` ("Not covered by a flow").
- *Interfaces*: `session.ts` and `api.ts` in the app; the mock issuer's `/token` (refresh grant, rotation, reuse detection); the BFF's UNAUTHENTICATED answer.
- *Test/chaos methodology*: the web-session tests are the model for the cases; the app's runner is `scripts/dev/mobile-flows.mjs`.

**You do not need to know about**
- The web session, the allergen item (`MOB-002`), how the BFF validates tokens.

**Out of scope**
- Changing the app's session behaviour (a defect found here is fixed under this item only if small, otherwise registered and the lead decides); iOS; real devices; the pipeline.

**Requirements / Acceptance Criteria**
- **Unit tests** of the session and API logic, run by `npm test` in `apps/mobile-customer` (Node test runner, like the packages) with the Expo modules (`expo-secure-store`, `expo-web-browser`, `expo-crypto`) and `fetch` replaced by fakes and a fake clock. The logic may be moved into plain modules to make this possible; the behaviour must not change. Cases, each with an asserted outcome:
  - an access token about to expire is renewed before a request; a valid one is not;
  - several requests at once cause **one** renewal;
  - the issuer **refuses** the refresh token (400): the session ends, the stored token is deleted, the state is signed out;
  - the issuer **cannot be reached** (network error) or answers 5xx: the stored token is **kept**, the customer is not signed out mid-session, and at start-up the login screen is shown with the token kept;
  - a rotated refresh token from a refresh is stored; a missing stored token is signed out;
  - an UNAUTHENTICATED answer from the BFF (HTTP 401 or the GraphQL code) is refreshed **once** and the request retried **once**; a second one ends in the sign-in state, never a loop;
  - the login callback: a wrong or missing `state`, no `code`, a cancelled browser and a refused code exchange make no session; the tokens are never written to logs or plain storage (assert on the fakes).
- **Flows** (Maestro, against the real stack, run by the one command):
  - **Refused session:** login, then the issuer forgets its refresh tokens (the runner restarts the `mock-oidc` container between two flows, or an equivalent that does not touch the app), then a restart of the app shows the **login screen** and the old token is gone.
  - **Failed checkout request:** the BFF becomes unreachable at checkout (or answers an error): the app says the order could not be placed, **keeps the order**, and a retry after the BFF returns places **one** order (the idempotency key was kept for the same content).
  - **Order edits:** quantity down and up, and remove a line, with the estimated total following (the spec of `MOB-001` listed these; the four flows use only "more").
  - An **expired access token** renewing silently is covered by the unit tests (the mock issuer's access token lives an hour, so a flow cannot wait for it); the evidence says so.
- Each test and flow is shown to **fail** when the behaviour it checks is broken (a one-line mutation per group, run and recorded), so a green result means something.
- `docs/evidence/WI-MOB-001/` or a new record states what ran, with the date and versions; register 145 and 148 are updated; `node scripts/ci/node-gates.mjs --tests` runs the new unit tests.

**Dependencies**
- Blocked by: `WI-MOB-001` merged or its branch as the base. Parallel with `WI-MOB-002`. The lead reviews the token handling (human approval: auth logic).

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes for the tests and flows. Any change to the session code or the issuer goes to the lead before it is made.

**Open Points (working)**
- [ ] Whether the unit tests move into the node-gates `--tests` list and the pipeline's web job or stay local (the app is not in the pipeline, register 148): the lead decides.
- [ ] How the "refused session" flow makes the issuer forget its tokens without a new endpoint on the issuer (a container restart orchestrated by the runner is the working assumption; a test-only endpoint would be an auth change and needs the lead).
