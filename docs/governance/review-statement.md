# What has and has not been reviewed

> **Status:** Current · written 2026-11-02 for `WI-SEC-005` step 5 (register item 129), to be kept up to date and read before the repository is made public (register item 93). It states what the records show; where the records do not show something, it says so. It is a statement of fact about this repository, not a claim about its quality.

## Who wrote what

The code, tests and documents were written by AI agents (Claude Code sessions) working under the direction of the human lead, who sets priorities, approves decisions, and reviews selected work. Each session starts from the written record (`CLAUDE.md`, the specs, the register), not from memory. The same kind of agent has written the code, the tests for it, the security reads of it, and the threat model of it. That is the main limit on every review below: the reviewer shares the author's understanding and its blind spots.

## Reviews that have happened

| Kind | What it covers | Who | Evidence |
|---|---|---|---|
| Design approval by the lead | Each architecture decision (ADR-0001 to ADR-0023), the lifecycle of an order, the BFF and session designs, the rate-limit design (2026-11-02), the merge of a fetched queue list by sequence | The human lead | ADR status lines; the decisions recorded in specs and the register |
| Approval per security-sensitive step | Changes to the shared session package, the stream endpoint and its token handling, the cookie session, the vendor stream limits | The human lead, recorded in the spec | `WI-QUE-003` progress notes; `WI-AUTH-007` |
| Review rounds of a built item | `WI-QUE-003` had two review rounds with the lead, who accepted some limits and asked for changes to others | The human lead | `WI-QUE-003`, register items 125, 126 and 131 |
| The agent's own security read | `WI-AUTH-007`, `WI-QUE-003` (the stream endpoint, hub, BFF route, web route and screen), `WI-QUE-004`, `WI-RATE-001` | The agent that wrote the code | `docs/evidence/WI-QUE-003/`, `WI-AUTH-007/findings.md`; it found real flaws late and the lead's rounds found more, so these reads are useful and not sufficient |
| A threat model | The browser, session and stream surface | The agent that wrote the code | `docs/architecture/threat-model.md` |
| Generated-input tests | Parsers and inputs of the BFF and the session package | Automated, written by the agent | `docs/evidence/WI-SEC-005/fuzz-2026-11-02.md` (it found a request that ended the BFF process) |
| Automated gates | Format, lint, typecheck, unit and browser tests, a documentation check, a scan of the full history for secrets | Tools, run locally and in the Azure pipeline | `docs/process/quality-gates.md`; the pipeline's jobs were seen green on Azure on 2026-10-31 for the jobs that existed then (the `queue`, `session` and `mobile` jobs have not run on Azure yet) |
| Static analysis and a dependency audit | A local SonarQube scan, triaged rule by rule (2026-11-06); `npm audit` and NuGet checks with SBOMs (2026-11-07) | Tools, run by the agent; the triage and the decisions on upgrades are the lead's | `docs/evidence/sonar/triage-2026-11-06.md`, `docs/evidence/WI-SEC-004/` |
| A secret scan of the whole history before publishing | gitleaks over every commit; local paths and personal data searched for and removed from the records | Tool and the agent, 2026-11-08; the scan alone rerun 2026-11-09 over 486 commits, no findings (that rerun's output was not saved as a record) | `docs/evidence/secret-scan-2026-11-08.md` |

## Reviews that have not happened

- **No independent human review of any code or design**, by a person who did not direct or write it. The lead's reviews are the only human ones.
- **`WI-AUTH-007` (the cookie session) has not been reviewed by the lead**; it stays In progress until it is (register items 118 to 122).
- **No penetration test and no review by a security specialist.**
- **Only one narrow dynamic scan** has been run: an unauthenticated OWASP ZAP scan of the local stack on 2026-11-03 (a baseline scan of both web apps, an API scan of the GraphQL endpoint). It found no High alert and no vulnerability beyond browser-hardening gaps, which were fixed. It did not see anything behind a login, the .NET services directly, or any deployed system (`docs/evidence/WI-SEC-005/zap-2026-11-03.md`).
- **A dependency audit and SBOMs exist (2026-11-07) but are not in the pipeline, and no container image has been scanned** (`WI-SEC-004`, register 162). It found no critical or high advisory; the 25 moderate ones are in development and build tooling, and nothing was upgraded. `graphql-sse` was also reviewed by hand and pinned.
- **No review of anything deployed**, because nothing is deployed. No review of the Terraform against an Azure subscription beyond the gate rehearsal in `docs/evidence/WI-DEP-001/`.
- **No review by a real identity provider's behavior.** The issuer is a local mock.
- **No accessibility review by a person.** Automated checks (axe) cover what a tool can decide.
- **No load test beyond one local soak** (66 minutes, five screens, one machine; `docs/evidence/WI-SEC-005/load-soak-2026-11-03.md`), a short run that checked the per-client rate limit (`client-address-load-2026-11-07.md`) and sequential latency measurements.
- **The Android app's token handling has had unit tests since 2026-11-05 (`WI-MOB-003`) but no outside review**, and it has run only on one emulator.

## How to read this

The tests, the gates and the evidence records show that the code does what its authors meant and that some classes of mistake are caught. They do not show that the authors' understanding was complete. The value of an outside review is that it would not share that understanding. If that matters for how this repository is used, treat it as unreviewed software written by a careful but single-minded author, and have it reviewed.
