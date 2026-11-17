> **Status:** In review · evidence: `packages/web-session/src/chaos-store.ts`, `packages/web-session/tests/chaos-store.test.ts`, `chaos/scenarios/session-outage.json`, `apps/web-customer/tests/chaos/session-outage.spec.ts`, `docs/evidence/WI-CHAOS-004/README.md`

```
WI ID:               CHAOS-004
Title:                Chaos scenarios: a layer on the web servers' session store
Type:                 Test/Mock/Chaos
Epic:                 EPIC-QUALITY-EVIDENCE
Shared with epic(s):  EPIC-SHARED-TOOLING
Hat/Owner:            Platform Engineering
Status:               In review
Size:                 M
```

**Context / Why**
Register 169 (1): every adapter of the repository's pattern has a chaos layer except the web servers' session store (`packages/web-session`, ADR-0019), so "the sessions Redis is down" could only be shown by stopping Redis. Registers 192 and 194 (2026-11-16) made an unreachable store a "try again" condition in every session route; this item lets a scenario produce that condition and shows what a customer sees. The lead chose the full version on 2026-11-16 (a layer, a scenario, a spec and a whole-stack run, as the other layers have) and approved it as session code.

**As built (2026-11-16, local only)**
- **Layer `session`** in `chaos/layers.json` and both libraries' copies (`KNOWN_LAYERS`, `ChaosScenario.Known`): `failureRate`, `latencyMs`, `outageFromSeconds`, `outageWindowSeconds`. A fault is `SessionStoreUnavailableError`, the error a real outage gives. No lost-response fault: a session write whose answer is lost leaves an orphan that expires by itself.
- **`chaosSessionStore`** (`packages/web-session/src/chaos-store.ts`): a decorator over any `SessionStore`. It applies signals and `where` rules: a call is described by its operation, a hash of its id (session and pending-login ids are bearer secrets and never reach a key, a log line or a rule), the session's subject where the operation has one, and for `putPending` only the page to return to.
- **Wiring** (`runtime.ts`): one chaos runtime per web process, shared by the GraphQL routes' gate (layer `web`) and the store; its journal now goes to the server log as the BFF's does, so `chaos-smoke.mjs` counts the web servers' faults. Nothing is built unless `CHAOS_ENABLED` is set and the process is allowed to run chaos.
- **Scenario `session-outage`** and its spec: the outage is switched on and off by two logins whose return pages are rules of the scenario. The run checks that a login during the outage lands on "Login is not available just now", that a logged-in customer's page is not blank or stuck, that a session made before the outage is kept, and that a new login works afterwards.
- **Tests:** 21 in `chaos-store.test.ts` (the store contract through the decorator with no faults, each fault, the seed's determinism, signals, `where` by subject, no secret in the journal); the shared-list checks of both libraries. The whole-stack run: [`docs/evidence/WI-CHAOS-004/README.md`](../../evidence/WI-CHAOS-004/README.md).

**Changes from the plan**
- Found by the run: during the outage a logged-in customer is asked to log in, and the login then says it is not available (register 195, the lead's decision).

**Dependencies**
- Blocked by: `CHAOS-003`. Uses registers 192 and 194.
