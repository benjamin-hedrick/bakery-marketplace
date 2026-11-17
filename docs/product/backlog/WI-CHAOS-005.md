> **Status:** In review · evidence: `packages/web-session/tests/relay-network-contract.ts`, `apps/web-customer/tests/unit/relay-network.test.ts`, `apps/web-queue-display/tests/unit/relay-network.test.ts`

```
WI ID:               CHAOS-005
Title:                Chaos scenarios: the web apps' Relay network functions against an equivalence contract
Type:                 Test/Mock/Chaos
Epic:                 EPIC-QUALITY-EVIDENCE
Shared with epic(s):  EPIC-SHARED-TOOLING
Hat/Owner:            Platform Engineering
Status:               In review
Size:                 S
```

**Context / Why**
Register 169 (2): the BFF and the Android app's `gql` have equivalence tests (an injected fault gives the caller what the real fault gives), the web apps did not. What existed was indirect: `packages/web-session/tests/chaos-equivalence.test.ts` compares injected and real faults over HTTP on the three things the network function was said to decide from (whether the call threw, the status, whether the body is JSON), an assumption no test checked; and the `web-door` scenario runs the real function in a browser at random, on one page. The lead chose a test of the function itself in both apps, the same kind every other client has (2026-11-16).

**As built (2026-11-16, local only)**
- **One contract, two apps** (the repository's contract-test pattern): `packages/web-session/tests/relay-network-contract.ts` takes an app's browser network function and runs it over real HTTP, behind a real server around the real GraphQL route handler, for each fault the `web` layer can inject and the same fault made for real: a 503 (a BFF 503 relayed), a 502 (the proxy's own, BFF refused), a 429 (the route's own rate limit), an answer that is not JSON (a BFF answering HTML), a reset connection (a web server that closes the socket), and no answer (a web server that never answers). Injected and real must give the same outcome (the same error, or nothing yet), and none may end the login: only the BFF's UNAUTHENTICATED does, which is checked too, with ordinary GraphQL errors and the no-fault answer.
- **The apps:** `apps/web-customer/tests/unit/relay-network.test.ts` (new `test:unit`, as the queue display has) and `apps/web-queue-display/tests/unit/relay-network.test.ts`. Each app exports its browser network function (`browserFetch`, `fetchGraphQL`; unchanged otherwise), and the two `environment.ts` files import with the `.ts` extension so Node's test runner loads them. The customer app's unit tests are a CI step of the `web-customer` job and a `node-gates --tests` step, and the full test report runs them.
- **Tests:** 7 per app at first, 8 since register 196 (the time limit). A mutation (a failed status taken as the end of the login) failed 3 of the 7.

**Changes from the plan**
- The plan was Playwright's runner for a unit test; the queue display already had a `node --test` suite, so both apps use that and no runner was added.
- Found: neither web app's network function had a timeout of its own (the Android app has one), so a web server that did not answer left the page loading (register 196). Fixed 2026-11-17 with the lead's approval: both give up after 35 s with a `TimeoutError`, and the contract has an eighth test that checks the limit on a controlled clock.
- Not checked: the `x-session-ended` header, which is the server's decision rather than a fault.

**Dependencies**
- Blocked by: `CHAOS-003`.
