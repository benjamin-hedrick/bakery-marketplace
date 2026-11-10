> **Status:** In review · evidence: `packages/chaos`, `services/graphql-bff/src/chaos.ts`, `services/graphql-bff/test/chaos.test.ts`, `apps/mobile-customer/tests/chaos-outcomes.test.ts`, the lost-response tests in `tools/tests` and the service tests

```
WI ID:               CHAOS-003
Title:                Chaos scenarios: the lost response, and the TypeScript library with the BFF's gate and client layers
Type:                 Test/Mock/Chaos
Epic:                 EPIC-QUALITY-EVIDENCE
Shared with epic(s):  EPIC-SHARED-TOOLING
Hat/Owner:            Platform Engineering
Status:               In review
Size:                 L
```

**Context / Why**
The lead's two requests of 2026-11-09 (ADR-0024): add the ambiguous failure (the work was done, the answer was lost) to the layers where it matters, and build the BFF's layers so "the BFF is stopped" can be produced by a scenario instead of by process control.

**As built (2026-11-09, local only)**
- **Lost response** (`ChaosLayer.LostResponse`): repository (a 408 after the write, for save, conditional save, delete and batch), payment (a timeout after the authorization), catalog gateway (after a reserve or a release), notification (after the send) and events (`publishLostResponseRate`: delivered, then the publisher is told it failed). Tests at each decorator with the real effect asserted (the data is stored, the message sent), and in the real ordering host: a lost store write leaves the order stored and a replay with the same idempotency key returns it; a lost catalog reservation is given back and the customer gets a 503; a lost payment response releases the stock and the customer gets a 500.
- **`packages/chaos`** (TypeScript, no dependencies): scenario loader and the same strict validation as C#, the keyed decision function (it reproduces `chaos/test-vectors.json`, including a 64-bit seed), journal, request scope, the gate (`DEPLOYMENT_ENVIRONMENT` or `NODE_ENV` development or test), `chaosFromEnv`. `chaos/layers.json` is the shared list of layers and settings, checked by the tests of both languages. New layers `bff`, `bffCatalog`, `bffOrdering` (also accepted by the C# loader, which reports them as not applicable in a C# service).
- **The BFF** (`src/chaos.ts`, a few lines in `server.ts` and `main.ts`, one dependency): the gate at the door (reject with a status 400 to 599, a 200 that is not JSON, a reset, no answer, latency, an outage window; `/healthz` untouched) and wrappers on the two service clients (unreachable, a 5xx, a body that is not JSON, a lost response, latency, an outage). The answer carries `X-Chaos-Scenario`, `X-Chaos-Injected` and `extensions.chaos` (no schema change). The Dockerfile copies the package and the scenarios; the dev Terraform gives the BFF `DEPLOYMENT_ENVIRONMENT`. Run in a real process and in the container: the scenario is read through the package link, the banner is logged, the indicator appears, and without `DEPLOYMENT_ENVIRONMENT` the container refuses to start.
- **Tests:** `packages/chaos` (44), the BFF (15 new, 260 in all): the gate's behaviours, determinism by trace id, the indicator, request headers that cannot switch anything on, and the equivalence tests (injected and real failures give the same GraphQL result); the Android app (`chaos-outcomes.test.ts`): every way of not getting an answer makes `gql()` reject, is not taken for a sign-in problem and leaves the session alone. Mutation checks (reject and lost-response injection disabled) failed the matching BFF tests. Gates: the chaos package's format, typecheck and tests are in `node-gates` and the pipeline's `bff` job; the chaos-not-deployed test also covers the Node settings.

**Changes from the original plan**
- The proposal numbered the BFF as its phase 4 and the whole-stack run as phase 3; this item did the BFF before the whole-stack run.
- Not built: a scenario on the whole real stack with evidence (the stack scripts passing one scenario to every process), the web apps' server-side proxies, the Relay environment's equivalence test, switching the Maestro flows that stop the BFF over to the gate. Register 169, 171.

**Dependencies**
- Blocked by: `CHAOS-001`, `CHAOS-002`.
