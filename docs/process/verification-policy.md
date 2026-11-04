# Verification policy: what a change must show

> **Status:** Proposed · drafted 2026-11-02 for the lead's review (register item 130). Not in force until the lead adopts it; the numbers marked "proposed" are the lead's to set. It adds to, and does not replace, the [Definition of Done](definition-of-done.md), the [test strategy](test-strategy.md) and the [quality gates](quality-gates.md).

The question this page answers: for a given change, which tests and which evidence must exist, and which are done later as a scheduled checkpoint. Two rules keep it from growing without end: a check is either **inline** (part of the change) or a **checkpoint** (with a trigger and an owner), and every checkpoint has an **exit condition**, so it can be finished and then re-run only when its trigger fires.

## 1. Classify the change

The work item states its class in the "Verification class" line of the template. When unsure, take the higher class.

| Class | A change that is... | Examples |
|---|---|---|
| **V0** | documents only | an ADR note, a runbook, this page |
| **V1** | code with no new surface and no change to a rule the user or another service can see | a refactor, an internal fix, a test added |
| **V2** | a new or changed externally visible surface: an endpoint, a route, a screen, an event, a stored shape | a new endpoint, a vendor action button, a new event type |
| **V3** | **sensitive**: auth, sessions, tokens, roles; anything that holds a connection, a queue or a resource per caller; anything that parses input from outside a service; a new dependency | the stream route, the cookie session, rate limiting, `graphql-sse` |

A change that crosses services or completes a user journey is also marked **J** (journey), which adds the real-stack run below.

## 2. Inline: what every change carries

| Check | V0 | V1 | V2 | V3 | J |
|---|---|---|---|---|---|
| Local gates pass (`node-gates.mjs`; `--tests` for code; `secret-scan.mjs` before push) | docs checks | yes | yes | yes | yes |
| Tests for the code touched, written so they fail when it breaks (not a test of the framework) | | yes | yes | yes | |
| .NET change: the Linux run (`linux-check.mjs`) | | yes | yes | yes | |
| Acceptance criteria each mapped to a test or an observation, in the spec's outcome note | | | yes | yes | |
| "ADRs and NFRs affected" line filled in, and the NFR or ADR note written in the same change | yes | yes | yes | yes | |
| Browser test in the mock-backed suite for a changed screen, with an accessibility scan for a new page type | | | yes (UI) | yes (UI) | |
| Test counts quoted from a script, not typed (section 6) | yes | yes | yes | yes | |
| Abuse cases in the acceptance criteria and a test for each (slow client, many clients, large input, a client that never reads, cleanup on leave, many requests per caller) | | | | yes | |
| Each security-property test shown to fail with the property removed (the mutation is recorded in the outcome note) | | | | yes | |
| Limits checklist for network-facing code (section 3) | | | | yes | |
| Dependency review record for a new package (maintainer, size, license, advisories, what it parses, how it is pinned) | | | | yes | |
| Adversarial review pass before building the sensitive part, and again before "In review"; the lead approves per step as `CLAUDE.md` requires | | | | yes | |
| Real-stack evidence run: the starting state, the command, the date, the raw result (section 5) | | | | | yes |
| Anything found and not fixed is in the register in the same change | yes | yes | yes | yes | yes |

## 3. Limits checklist (V3, network-facing code)

For each, the value or "not applicable, because", and the test that shows it holds: **size** (body, header, line), **count** (connections, streams, items per caller and in total), **time** (read, write, idle, total life), **rate** (per address, per login, per route), **cleanup** (what is released when the client leaves, errors or stalls), **failure mode** (what the caller sees when a limit is hit, and that it is not a crash).

## 4. Scheduled checkpoints

Checkpoints are the checks that are too slow, too wide or too costly to run on every change. Each has a **trigger**, an **owner** (the lead decides; the agent prepares), an **exit condition** for its first run, and a **record** (an evidence file with the commit, the command, the date and the raw output).

| Checkpoint | Trigger (run again when) | First-run exit condition | Item |
|---|---|---|---|
| Cross-browser matrix: Firefox, WebKit and a mobile viewport on the mock-backed suites, then on the real stack | a screen is added or its layout changes; before a demo | each suite run on each browser, failures fixed or listed in the register with a reason | new |
| Android app flows on the emulator (`node scripts/dev/mobile-flows.mjs`; local only, not in the pipeline, register 148) | the app, the BFF schema it uses, the issuer's redirect rule or `packages/customer-core` changes; before a demo or a push of the app | every flow passes from a cold start, the result recorded with the date and versions (`docs/evidence/WI-MOB-001/`) | `WI-MOB-001`, `WI-MOB-003` |
| Repeated-run flake check (`repeat-suite.mjs --runs 10`) | the browser suite changes by more than a few tests; monthly while active | 0 failures in the runs, or each failure explained | `WI-QA-002` |
| Load and soak of the stream and the main routes | a limit, the hub or a route's cost changes; before the repository is public | the limits in the NFRs reached and the behaviour at the limit recorded; a one-hour soak with renewals; a restart under load | register 129 |
| Fuzz and property tests of parsers and inputs (the BFF's stream reader, its JSON and stream routes, the web routes and headers, GraphQL inputs) | a parser or input is added (its first fuzz test is inline at V3); a longer run at each milestone | a bounded run per target (proposed: 100,000 cases or 10 minutes) with no crash, hang or leak; findings in the register | register 129 |
| Threat model (browser, session and stream; then the services) | a new trust boundary or a V3 change (update the page inline); a full read at each milestone | one page for the browser, session and stream surface, with each threat tied to a control and a test, or to a register item | register 129 |
| Dynamic scan (OWASP ZAP baseline) of the local stack | before the repository is public; after a V3 change to a route | scan run, each finding fixed or recorded with a reason | register 129, `WI-SEC-004` |
| Rate-limit verification | the limits or the routes change | a burst is refused with a clear status and normal use is not (section 7) | register 128 |
| Dependency audit and SBOM | a milestone; before public | audit run, advisories listed, SBOM committed | `WI-SEC-004` |
| First Azure pipeline run of new jobs | when the pull request is opened | the job green, or the failure recorded | per item |
| Independent-review statement | before the repository is public | one page saying what the author agent read, what the lead reviewed, and that nothing else was independently reviewed | register 129 |
| Mutation spot-check of recent tests | a milestone | a sample of 10 tests broken on purpose; the survivors listed | `WI-QA-002` |

A "milestone" is a point the lead names (for example: before the demo recording, before the repository is public). Until the lead names it, checkpoints run on their triggers only.

## 5. Evidence records

Every evidence record states: the commit, the exact command, the date, the **starting state** (for example "Compose down, volumes removed, seeded"), the raw output or a path to it, and what was **not** covered. A cross-service feature (class J) is shown on the real stack with host processes and, when the change touches the containers, once in containers mode (`skeleton-smoke.mjs --containers`). Don't keep Docker state between runs (`--keep`) for an evidence run. Report passed, failed, skipped and not-run separately.

## 6. Counts come from a script

Test counts in `CLAUDE.md`, `test-strategy.md` and the specs go stale when typed by hand (the test strategy lists a BFF count of 75; the BFF has 107 tests). Until `WI-QA-002` delivers a script that prints them, a change that adds tests quotes the count from the run it just made, and a documentation sweep at each milestone updates the rest.

## 7. The quality track: when it is done

The quality track (the process review, cross-browser, rate limiting, then load, fuzz, threat model and scan) is **finished for now** when: each checkpoint in section 4 for which a first run is named has run once, its record is committed, and its findings are fixed or in the register. After that the checkpoints run only on their triggers. New checkpoints are added when a failure shows a gap, and the reason is written in the lessons record. That is the limit; it is not a promise that nothing more will be found.

### Plan for register item 128 (rate limits)

1. Decide where limits live (the web app's server and the BFF; API Management cannot limit per user, ADR-0008) and the numbers: **approval of the lead needed, because it touches login and session logic**.
2. A token bucket per address on `/api/auth/*`, `/api/graphql`, `/api/graphql-stream` and the BFF routes, in the shared place both web apps use (`packages/web-session` for the web routes).
3. Tests: a burst is refused with 429 and a `Retry-After`; normal use is not; the bucket refills; limits are per address and not shared between addresses; the limiter's memory is bounded.
4. Class V3: abuse cases first, mutation check of the tests, outcome note, the NFR sections on abuse resistance and per-caller limits get their numbers from the decision in step 1.

### Plan for register item 129 (load, fuzz, threat model, scan)

1. Threat model first (one page; it decides what the other steps aim at).
2. Fuzz and property tests under the Node test runner for the stream reader and the BFF inputs.
3. Load and soak: the delay script with many screens, one hour with renewals, a restart under load, recorded under `WI-QA-002`.
4. ZAP baseline of the local stack, added to `WI-SEC-004`'s scope.
5. The independent-review statement.

## 8. What this asks the lead to decide

Listed with the edits in the register item 130 entry: adopt or change the classes, the checkpoint triggers and the numbers marked "proposed".
