> **Status:** In review · evidence: `docs/architecture/threat-model.md`, `docs/evidence/WI-SEC-005/` (fuzz, soak, ZAP), `docs/governance/review-statement.md`; all five steps are done and recorded (see the outcome note of 2026-11-03 below)

> **Progress note (2026-11-02, steps 1 and 2):** the threat model is written (two gaps found: register 134 and 135). The fuzz step found a request that ended the BFF process (register 136) in its first run; it is fixed with a test that starts the real process. Generated-input tests now cover the BFF's stream reader, JSON route and event-stream path, the global ids, and the session package's returnTo, cookie, CSRF, header, body, address and limiter functions. BFF 141 tests, session package 172 (13 skipped without Redis).


> **Progress note (2026-11-02, fixes for 134 and 135):** the browser hardening headers are set in both apps (CSP without a script nonce, frame protection, `nosniff`, referrer and permissions policy) with tests that show them working in five browser profiles, and the BFF refuses operations over a depth, root-field and total-field limit (and can refuse introspection). BFF 155 tests; queue display 53 browser tests. Open: `'unsafe-inline'` in `script-src`, HSTS, and the introspection decision.

> **Outcome note (2026-11-03):** all five steps are done and recorded. The fuzz step found a request that ended the BFF process (register 136, fixed). The threat model found two gaps (134 browser hardening headers, 135 GraphQL cost limits), fixed at the lead's request. The soak (66 minutes, 762 orders, five screens, an ordering restart): nothing missed, p50 110 ms and p95 146 ms request-to-screen, no memory growth; it also showed that the BFF's rate-limit backstop is shared by all users of a web app (register 137, open). The unauthenticated ZAP scan found no High alert; its Mediums are `unsafe-inline` in the CSP, and its Lows were fixed except the Embedder Policy. Not done: an independent review, a scan behind a login, a scan of the .NET services directly, and anything deployed.

```
WI ID:                SEC-005
Title:                Threat model, fuzz and property tests, load and soak, a dynamic scan, and a review statement (register item 129)
Type:                 Docs and tests
Epic:                 EPIC-CI-CD
Shared with epic(s):  EPIC-QUALITY-EVIDENCE
Hat/Owner:            Quality, Security
Status:               In review
Size:                 L
Verification class:   V3 (security verification itself). Classes are proposed in `docs/process/verification-policy.md`.
ADRs and NFRs affected: NFR 3.8 and 3.9, 5.1; ADR-0019, ADR-0021 (their limits are exercised); `WI-SEC-004` (the scan is added to its scope).
```

**Context / Why**
Register item 129: no load, soak, fuzz or dynamic testing is planned or recorded, no threat model exists for the browser, session and stream surface, and every security review so far was a read by the agent that wrote the code. The level that fits a portfolio project is written in the register entry; this item does it, one step at a time, and says plainly what it does not show.

**Steps (each is a commit with its record; the lead can stop after any)**
1. **Threat model** (`docs/architecture/threat-model.md`). Done when it lists, per trust boundary, threats, controls, evidence and gaps, and every gap is in the register.
2. **Fuzz and property tests** with the Node test runner for the parsers and inputs added or exposed by `WI-QUE-003` and later: the BFF's reader of ordering's event stream, the BFF's JSON and event-stream routes, the web app's routes and headers, `safeReturnTo`, the global-id decoding, and the GraphQL inputs. Bounded: a stated number of cases and a fixed seed, so a failure can be repeated. Done when no crash, hang or leak is found, or each is fixed or registered.
3. **Load and soak** of the live stream and the main routes on the local stack: many screens, one hour with renewals, a restart of a service under load, the limits of `WI-QUE-003` and `WI-RATE-001` reached. Done when the behavior at each limit is recorded.
4. **A dynamic scan** (OWASP ZAP baseline) of the local stack, added to `WI-SEC-004`'s scope. Done when it has run and each finding is fixed or registered. Needs Docker; a scan against a local stack is not a penetration test.
5. **A review statement** (`docs/governance/review-statement.md`): what the author agent read, what the lead reviewed, what ran automatically, and that nothing else was independently reviewed. Written before the repository is public (item 93).

**Out of scope**
- Fixing every finding (a fix that touches auth or the shared session package needs the lead's approval and is its own item); a penetration test by a person; anything deployed.

**Requirements / Acceptance Criteria**
1. Each step above has its record committed with the commit, command, date, starting state, raw result and what it does not show.
2. Findings are in the open-items register in the same change.
3. The test counts are quoted from the runs.

**Dependencies**
- Blocked by: none. Uses the combined work of `WI-QUE-004` and `WI-RATE-001` as its subject.

**AI-agent suitability**
Full for the build and the runs. Flag, do not choose: any fix to auth or session logic; what level of independent review the project claims.

**Open Points (working)**
- [x] Whether to fix the missing browser hardening headers (register 134) and the missing GraphQL cost limits (register 135) in this item or as their own. **Resolved 2026-11-02:** the lead asked for both now; done in this item.
- [ ] Whether a deployed environment refuses introspection (`BFF_DISABLE_INTROSPECTION=1`), and whether to move `script-src` to nonces (a larger change).
- [ ] Whether an outside reviewer is wanted before the repository is public.
