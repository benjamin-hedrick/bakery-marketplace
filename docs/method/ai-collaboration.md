# AI collaboration in this repository

> **Status:** Current, expected to change · written 2026-10-30 from the repository's own records; the error table and the usage figures extended 2026-11-08; written in the first person and repeated counts removed 2026-11-16. It says how AI assistants are used here, what went wrong, and which control caught it. AI models and tooling are changing quickly, so this record is reviewed and revised as new information arrives (see "A moving target"). Its numbers are measurements; its judgments about speed and value are my experience and are labelled as such.

The repository is an experiment in building a small product with AI assistants under human direction, while keeping practice and technology current. I decide and approve; AI assistants draft, implement, verify and record. Most of the code and documentation was written by an assistant (Claude Code in interactive sessions, after an earlier phase of planning in chat) and reviewed by me. Records written during the work call me "the lead".

**My experience** (not a measurement): the assistants have been very productive and have saved a lot of time, they catch errors (including each other's and mine) as well as make them, and the iterations through this way of working have gone much faster than I expected. That is the reason to keep the way of working under review rather than treat it as settled.

## How this repository was built

Iteratively, with AI collaboration throughout. The planning ran in chat in September; the foundations were built by delegated agents from self-contained packets; from the portfolio-slice reset on 2026-10-26 everything was built in interactive sessions in small cycles: a work item is specified, built in layers, run, recorded with what it does and does not show, and reconciled against the code. I decide and approve; the assistants draft, implement, verify and record. There is no hand-built version to compare with and none is planned: the evidence of the approach is the records it left (the specifications, the decisions, the runs, the register and the lessons) and the controls that caught its errors (below).

## How the process was tuned

Most of what follows was added in response to a specific problem, and each change is traceable. The aim of each was a more efficient process with less rework; **the rework saved was not measured** (lesson L-02 says so), so these are practices with their reasons and evidence, not measured savings.

| Practice | Introduced | What prompted it | Evidence |
|---|---|---|---|
| **`CLAUDE.md` as the conventions file**, adjusted as the work taught: work items are the unit of work; nothing is called working unless it was run; passed, failed, skipped and not-run reported separately; shared files have one editor; Cosmos queries are parameterized | 2026-10-26 (`155a61b`) | The reset to the portfolio slice, after reviews found specs and status claims nobody had run | The rule history is in `git log -S` for each rule |
| Human approval for security, authorization and IAM changes and before widening scope; no secrets in files | 2026-10-27 (`f08b0f3`) | The start of interactive slices | [approval gates](#how-the-work-is-organised); every auth and IAM item records my decision |
| Anything found and not fixed goes into the register in the same change | 2026-10-28 (`d9de76f`) | So a later session does not re-analyze it | [The register](../governance/open-items-register.md); every item has a status |
| Specs are kept accurate to what was decided and built; ADR decision text is never edited | 2026-10-30 (`065293a`) | The documentation reconciliation: seven specs had to be rewritten after designs changed | `status-and-supersession.md`, L-02 |
| Do not build functionality only to close a gap in testing; use seed data | 2026-11-04 (`b2cab31`) | Test-only mechanisms found while building the Android flows (register 150) | `WI-ORD-010` replaced a decline switch with seeded payment methods |
| Shell edits: files and edit scripts through the Write tool, not heredocs | 2026-11-06 (`d83848e`) | A heredoc ran backticked commands instead of writing them (L-24) | L-24 |
| Counts and dated status removed from the overview | 2026-11-06 | A fact written in many places drifts (L-10) | L-10; the generated test record |
| **Guided work:** delegated packets in September, interactive sessions with an approval list from October; a current plan with what is on deck, and a resume note at the end of each session | 2026-10-26 on | The handoff failures of September (above) | `current-plan.md`, the session records |
| **Spec-driven development:** a specification is written, reconciled with my answers to its open points, then built in layers, then recorded with "Changes from the original plan" | throughout | Specs that described designs later changed | `WI-ORD-010` (drafted 2026-11-06, reconciled the same day, built in six layers); `WI-MOB-002` and `WI-MOB-003` specified before they were built; `WI-CAT-003` rewritten and approved before building |
| **Test-driven and contract-first:** an interface and its shared contract suite are their own work item before any implementation; a test must be shown to fail without the property; mutation checks | September on | A test is not evidence until it can fail (L-09) | `CACHE-001` before `CACHE-002` to `004`, `DATA-001` before `DATA-002`, `EVT-001` before `EVT-003`; the verification policy; the cache invalidation rules, each broken on purpose |
| **Pulling decisions up:** ADRs before building, decision checklists, the surprise rule (each surprise asks what should have caught it), my decisions on open points before a build starts | October on | Four services were scaffolded before their mapping existed (ADR-0009 followed) | [surprise rule](surprise-rule.md) (with its cases), [decision checklists](decision-checklists.md), L-01, L-02, L-22 |

Correction commits are not evidence of rework saved. Commit messages that mention a fix, a correction or a revert were 1 of 31 up to 2026-10-25, 15 of 161 from 2026-10-26 to 10-31 and 27 of 217 from 2026-11-01 to 11-08; the share rose as the controls found more, which is what they are for.

## How the work is organised

- **One conventions file, `CLAUDE.md`.** It tells every session what the project is, which commands to run, the architecture rules, and the working conventions. Rules in it that matter most for AI work: do not describe anything as working unless it was run; report passed, failed, skipped and not-run results separately; work items are the unit of work; the register is updated in the same change that finds a problem; shared files have one editor at a time.
- **Human approval required** for security, auth logic, IAM and RBAC changes, and before expanding the scope of a work item or refactoring code (`CLAUDE.md`). The assistant stops and asks at those points. For decisions that are not on that list and have a conventional default, it picks the default, says so, and continues.
- **Sequential sessions only.** Several sessions have worked on the repository over time, one at a time. No two agents have edited it concurrently, and the shared-file rule exists so that this stays safe.
- **Durable records, not conversation.** Status lives on the spec banner and in `STATUS.md`; decisions in ADRs; unresolved findings in the register; runs in `docs/evidence/`; what happened in commit messages that each name a work item. A new session starts from those, not from memory of an earlier one.
- **Short persistent notes** outside the repository carry my working preferences between sessions (how branches and pushes are handled, that findings go in the register in the same change, the priorities). They are not a substitute for the records above.

## How delegated work is specified

[Context completeness](context-completeness.md) describes what a delegate needs and how it varies. Two phases of delegation happened here.

- **September 2026: packets.** Seven packets were handed to agents that had repository access (`docs/history/sept-2026-delegation/`). A packet is a self-contained brief and goes well beyond a work item's reference list. It carries instructions (what to build and how to approach it), guidelines (conventions, what to do when something is ambiguous), limits (scope boundaries in full, what to leave alone, what needs approval), the status of related work as a fact, which other packets are truly independent, known drift risks, the definition of done and how to hand the result back; it points at, rather than restates, anything the agent can look up, and names the work item that holds the full spec. They were grouped by shape: a solo packet for a blocking item, a pair when the task shape matched and no code was shared.
- **October 2026: interactive slices.** Slice 1 was built in interactive sessions with me, against ready work items, with no packets. The approval list, the register rule and the verification below did the work that packet scoping did before.

## Handoff integrity: three failure modes and the rules

All three happened in September, before real delegation scaled up. Each is a handoff artifact (a spec, an identifier, a status) trusted as authoritative while its authority depends on a check or decision nobody had made visible.

| Failure | What happened here | The rule |
|---|---|---|
| **A spec goes stale relative to its source** | `WI-AUTH-005` was scoped as token minting only. An ADR amendment later required a real browser login (authorization code with PKCE). The decision record was updated; the work item still described the old scope. The packet had to say which file to trust (`docs/history/sept-2026-delegation/DELEGATION-PACKET-04-auth-005.md`) | A handoff points to two things: the work item, and the decision it implements. Where they differ, the decision wins and the spec gets a dated reconciliation note. Specs are kept accurate to what was decided and built (`status-and-supersession.md`) |
| **Two sessions claim the same identifier** | A new item for the base .NET solution was drafted as `DEV-001`, the ID a session days earlier had given to the compose file in the same epic. Three IDs were shifted and the cross-references fixed by hand (recorded in `docs/history/backlog-outline-2026-10-29.md`) | Before assigning an ID, search the backlog for it (`git grep`), not memory. The work-item template says so |
| **A status decision left for the agent to work out** | By the time `WI-AUTH-005` was being rebuilt, a review had found that the earlier packet's output was only a data record, not the issuer. The planner knew; the new packet had to say it outright: do not assume the earlier packet was completed (`DELEGATION-PACKET-05-auth-005-rebuild.md`) | Status of related work is stated as a fact in the handoff, not left to be inferred from history. Today the fact is the spec banner |

## What the assistant got wrong, and what caught it

The point of this table is the right-hand column. Each error was caught by a control, not by the author, which is why the controls matter.

| Where | What went wrong | Caught by |
|---|---|---|
| Event transport tests | Every test used one event type, so they shared a Redis consumer group and took each other's messages | A runtime upgrade (.NET 10) made it frequent; repeated runs proved the fix |
| Tracing tests | A process-wide listener also saw other tests' spans; a non-thread-safe list | The Azure run, passing locally |
| Browser login tests | Read the URL before the router finished, twice | Repeated runs |
| A journey test | A regular expression that matched the time format of one time zone; the page was correct | The Azure agent, which runs in UTC |
| Token endpoint validation | On Linux `Uri.TryCreate` of a relative path yields a `file:` URI that counted as loopback, so an insecure endpoint was accepted | Azure; a real portability bug, not a flaky test |
| Local state | Generated Relay files and a results folder existed on the development machine and not on a clean agent | Azure |
| A design assumption | A failed checkout could be retried under the same idempotency key | The first real-stack browser journey (`first-slice-contract.md`, section 6; register 81) |
| A JWT test | It built its own validation parameters and exercised the framework, so turning issuer validation off in the project's own code left it green | The mutation sample of 2026-10-30 (register 85) |
| Cosmos adapter tests | They pass without touching Cosmos, and fail against the real emulator | A run against the emulator (register 31) |
| This reconciliation, October 2026 | A time for a whole browser journey was compared with the time of a single call; a squash merge was assumed to keep early commits out of `main` when older commits were already there; the surprise rule was substituted for context completeness; one approved mutation check was missing from the first batch | Writing the ADR note; reading the branch history; my review; tallying against the approved list |
| A new script (`secret-scan.mjs`), 2026-10-30 | It was committed without running Prettier, whose check in the `web` job covers `scripts/` | The Azure format check; the cure is `scripts/ci/node-gates.mjs` (register item 95) |
| A pasted pipeline error, 2026-10-30 | A fix was pushed to a branch whose pull request I was still reviewing, against the rule to fix locally and push once when agreed | Me; a permission prompt on `git push` was added as a backstop |
| Writing a record, 2026-10-30 | A heredoc with backticks in it ran the backticked commands, including a 10-run test job, instead of writing them | The command timing out; the job was stopped and nothing in the tree had changed |
| Writing evidence, 2026-10-30 | Text stated more than was measured: "flat, no drift" for runs that fell from 34.2 s to 31.4 s; a status listed as stale that did not state one; a cause for a 7 s timing that was not checked | Re-reading the claim against the output before committing |
| A Compose variable, 2026-10-31 | A new service in the optional `apps` profile used `${ORDERING_CLIENT_SECRET:?...}` (required). Compose checks every variable in the file, including services that were not selected, so the pipeline's step that only starts Redis failed on a clean agent with no `.env`. It passed on the development machine because `.env` exists there | The Azure pull-request run (a clean agent), as in the earlier local-state findings; reproduced locally with an empty `--env-file`, fixed with an empty default (the service then stops at start-up and names the missing setting) |
| A cache test, 2026-11-07 | A test waited with no time limit on a second request; with the code deliberately broken in a mutation check, the run hung for more than five minutes and left a process alive (lesson L-25) | The mutation check itself; every wait now has a limit and the rerun failed in 5 seconds |
| A mock, 2026-11-07 | The mock BFF sent no `Cache-Control` while the real one always does, so a test was not checking what it claimed (L-26) | The test failing; the real BFF's own tests are now the reference |
| An Android flow, 2026-11-07 | A tap landed on a payment button because the list loaded late and moved "Place order"; the refused card was chosen (L-27, register 161) | The first run of the flow; the layout was fixed and the flows around it re-run. A first fix that reserved too much room pushed the button off the screen and failed another flow (L-32) |
| Mutation checks, 2026-11-04 and 2026-11-07 | One was applied backwards and passed; one did not build so nothing was evaluated (L-29) | A run that printed 15 tests where 23 were expected; a command that would have discarded uncommitted work was refused |
| A schema comment, 2026-11-07 | It said another role would be refused; the service accepts either role and decides from who owns the order (L-30) | Planning a real-stack test of the behaviour |
| Dates and remote state, 2026-11-07 | "2026-11-08" was written in about ten documents for work done that day, and merged branches were reported as still on the remote when only stale tracking references showed them (L-31) | Found after the fact; the date was corrected in commit `ec47b70`, and the remote is now checked with `git fetch --prune` first |
| The demo film's scripts, 2026-11-08 | The director deleted its own log folder, ended while the vendor was still working the queue, and a cancel lost a race with the vendor; two labels covered page text; captions overlapped | Running it and reading its timeline and frames (`docs/operations/demo-film.md`) |
| Documentation drift, found by the pre-publish review of 2026-11-08 | The ADR index, the decision timeline, the patterns page, the NFRs, the evidence index, the test strategy, the roadmap, the current plan, the scope, the vision, the personas, the tech stack and several more still described the state of 2026-10-30, and two (NFRs, test strategy) said load, fuzz and dynamic scans had not run when they had. By design the documents are not all updated on every change (the register and the specs are, the overview pages are reconciled at slice boundaries); nine days of fast building outran that | A deliberate review pass against the code and the evidence, listed in `docs/history/pre-publish-review-2026-11.md` |
| A shell heredoc, 2026-11-08 | An edit script was written through a heredoc, against the working convention (L-24) | Noticed on re-reading the rule; nothing was lost, and the next edits used the file tools |
| The full documentation pass, 2026-11-08 (later session) | The pass first read status lines and dates, sampled specs and listed most files for "a second pass", which I corrected ("read and analyze them all"); a new file overwrote an existing `SECURITY.md` (restored from git); risk R-12 was marked Mitigated although register 98 showed the first checkout still took about 7 s after the warm-up; an empty heredoc hung a shell command; four commits cite a work item (`WI-PORT-005`) that is about tracing | Me (the pass); `git diff` and a re-read of the register (the overwrite and R-12); the shell timeout; a later check of the work item ids (the commit references) |

Seven of the ten test episodes recorded by 2026-10-30 were found by the clean Linux pipeline or container run and not on the development machine (`docs/evidence/test-reliability/findings.md`).

## The controls that did the catching

- **A clean agent early.** Azure Pipelines, and `node scripts/ci/linux-check.mjs` for the .NET steps, because the development machine is Windows in one time zone with state left behind.
- **Real-stack journeys** against the real services, issuer, database and event stream, not only mocks.
- **Repeated runs as the bar for a fix.** "Five in a row" is a rule of thumb, not a statistic; the mock browser suite has since been run ten times in a row with no failures ([quality report](../evidence/quality-report-2026-10-30.md)).
- **Mutation checks.** A test is not evidence until it can fail. They were run by hand over slice 1, and a sample on 2026-10-30 found a test of the framework, not of the project's code ([test reliability](../evidence/test-reliability/findings.md)). No automated mutation tool is used.
- **Contract tests against the real dependency**, with the known caveat that some fall back to fakes when the dependency is absent.
- **Human approval gates** and the rule that the assistant stops at scope expansion.
- **Reconciliation of specs against code,** and the rule that a spec describes what is true now.
- **Reporting results as passed, failed, skipped or not run,** so a summary cannot hide a skip.
- **Enforced:** the status, traceability and link checks run in `node scripts/ci/node-gates.mjs` and in the pipeline's `docs` job, which a ruleset on `main` makes a required check for every pull request since the repository became public (register item 90).

## Working conventions with the assistant

What has worked in this repository, stated as practice:

- State assumptions before drafting a decision, so I can redirect early.
- Say whether a request is analysis (read and report) or generation (write files); do not edit during analysis.
- Inspect before editing and run before claiming. Report failures and skips as plainly as passes.
- Keep scope narrow. If something needs a larger change, stop and flag it.
- When a PR check fails, do not push a fix per error: reproduce locally, run every gate on the final tree, and push once.
- Record what was found and not fixed, in the same change.
- Do not push a branch whose earlier commits contain material that should not be public: a merge or a rebase merge keeps every pushed commit in `main`, so clean the commits first (rewrite or squash). The October review branch was handled that way (decision D-17); later branches were pushed and rebase-merged as they were.
- On a Windows development machine with a bash-like shell: write a long script to a file and run it, because long heredocs containing quotes fail to parse; the shell may reset to the repository root between commands, so use absolute paths; Git warns that line endings will change, which is expected (`.gitattributes` normalizes them).

## What the sessions cost

Each Claude Code session's cost, model time and size were copied by me from the usage screen at its end and recorded under `docs/evidence/ai-usage/ai-usage-*.md`. The screen labels its figures approximate and the repository did not measure them. **Cost is shown as a relative cost, not as money:** the screen's figure divided by a base of 2.00 (the size of a small session), to two decimals, so a session of 12.00 was about twelve times that small one. The screen's dollar figures are not an accurate measure of what the work costs most users, and they were left out on purpose (register 175, 2026-11-11). Wall-clock time is not recorded: it is mostly me reading, deciding and waiting, and says little. The planning in chat before the repository and the September delegation packets are not in this table. **The model is named in both places:** the record's "Main model" line gives the model and its tokens, and the table has a Model column, so a change of model shows in the roll-up (added 2026-11-23, at the lead's request; the records already named it, the table did not).

| Session | Model | Work | Relative cost | API time | Lines added |
|---|---|---|---:|---:|---:|
| A (date not recorded) | Sonnet 5.5 | an earlier session | 4.79 | 37 min | 2,720 |
| B, 2026-10-31 | Sonnet 5.5 | the dev-environment and teardown work | 1.44 | 12 min | 1,224 |
| C, 2026-11-01 | Sonnet 5.5 | browser sessions and the vendor queue's read side | 17.41 | 1 h 27 min | 11,083 |
| D, 2026-11-02 | Sonnet 5.5 | the live vendor queue | 10.66 | 1 h 5 min | 6,992 |
| E, 2026-11-02 evening | Sonnet 5.5 | vendor actions, rate limits, the security and quality pass | 6.91 | 41 min | 3,462 |
| F, 2026-11-03 | Sonnet 5.5 | the notification service | 1.22 | 12 min | 1,252 |
| G, 2026-11-03 to 04 | Sonnet 5.5 | order history, start of personalization | 7.04 | 42 min | 4,761 |
| H, 2026-11-04 | Sonnet 5.5 | the rest of personalization | 9.41 | 1 h 3 min | 7,529 |
| 2026-11-04 | Sonnet 5.5 | the mobile spike | 1.02 | 9 min | 184 |
| 2026-11-04 | Sonnet 5.5 | the Android app build | 11.45 | 50 min | 3,243 |
| 2026-11-05 | Sonnet 5.5 | static analysis and documents | 0.67 | 6 min | 198 |
| 2026-11-06 | Sonnet 5.5 | the register walk-through | 2.73 | 25 min | 624 |
| 2026-11-06 | Sonnet 5.5 | register items and payment methods (`WI-ORD-010`) | 5.09 | 37 min | 2,161 |
| 2026-11-07 | Sonnet 5.5 | CI fixes, the listing cache, cancel buttons, order polling | 12.19 | 49 min | 3,850 |
| 2026-11-07 (second) | Sonnet 5.5 | the fulfillment strategy, the dependency audit, the demo film's scripts | 4.87 | 25 min | 2,213 |
| 2026-11-08 | Sonnet 5.5 | the demo film's runs and the documentation pass | 5.57 | 33 min | 1,076 |
| 2026-11-08 (second session) | Sonnet 5.5 | the full documentation read, code review rounds 1 and 2, the transport and outbox fixes | 16.82 | 48 min | 1,445 |
| 2026-11-08 into 2026-11-09 (third session) | Sonnet 5.5 | review fixes, the full test report, the Cosmos test fix, the latency run, the Maestro runs | 9.45 | 30 min | 1,056 |
| 2026-11-09 (fourth session) | Sonnet 5.5 | the failed CI check, the full Maestro and browser runs, the Cosmos tests, the stranger's-eye fixes, the push | 1.62 | 10 min | 267 |
| 2026-11-09 (fifth session) | Sonnet 5.5 | chaos scenarios: ADR-0024, the .NET layers, the lost-response fault, the TypeScript package and the BFF's gate | 6.12 | 38 min | 5,249 |
| 2026-11-10 | Sonnet 5.5 | chaos scenarios: aimed faults, token identity, signals, flow 11 on a scenario | 1.25 | 9 min | 874 |
| 2026-11-11 | Sonnet 5.5 | approvals and development: flow 07, one Unavailable outcome, the web gate, the small gaps, the scenario name, the usage format, `CLAUDE.md` | 3.39 | 17 min | 835 |
| 2026-11-11 (evening) | Sonnet 5.5 | chaos specs per scenario: the runner, four scenarios run on the whole stack, three defects fixed, two found open | 2.12 | 14 min | 980 |
| 2026-11-11 (late) | Sonnet 5.5 | the chaos work closed out: three defects fixed (182, 183, 171), eight scenarios and two emulator flows run, ADR-0024 accepted, one cache gap fixed and one documented (184) | 6.32 | 1 h 3 min | 1,453 |
| 2026-11-12 | Sonnet 5.5 | Dependabot alerts fixed, 15 Android flows run, register items closed on my decisions | 0.48 | 3 min | 29 |
| 2026-11-16 | Opus 5.5 | the public-presentation review: a fresh clone, the Next.js fix, the front door rewritten, generated BFF types, the checkout split, warnings cleared, the local-development page verified | 15.29 | 40 min | 1,581 |
| 2026-11-16 (evening) | Opus 5.5 | the pipeline fix, the session store under outage (login and routes, a chaos layer and scenario), the web network contract, a client time limit, the test report corrected | 10.99 | 32 min | 1,762 |
| 2026-11-17 | Opus 5.5 | the pipeline's traceability check, the chaos latency tests on a manual clock | 1.18 | 6 min | 119 |
| 2026-11-17 (afternoon) | Opus 5.5 | the Dependabot triage, the checkout's typed "try again" with a chaos scenario, the test-design review | 3.92 | 13 min | 211 |
| 2026-11-17 (evening) | Opus 5.5 | the test-design fixes in the browser tests and the rule for them, the picomatch alert and a dated exception in the audit | 3.16 | 11 min | 399 |
| 2026-11-17 (late) | Opus 5.5 | the Android flows' own seed listings (register 200), the current plan corrected; time lost to a hung shell (register 201) | 1.85 | 6 min | 179 |
| 2026-11-18 | Opus 5.5 | the pre-push gates, the wall-clock tests on a manual clock (register 202), the parked order outbox's counters and runbook (register 74), the listing kind (register 66) | 5.60 | 19 min | 665 |
| 2026-11-18 (second) | Opus 5.5 | the listing outbox's counters and runbook (register 203), dependency outages run on the local stack (register 166) and the three fixes they called for (registers 204 to 206), an intermittent chaos test (register 207) | 14.44 | 59 min | 1,996 |
| 2026-11-18 (third) | Opus 5.5 | the withdrawn picomatch advisory (register 199), a failed cache invalidation no longer serving the old status (register 184), and the vendor's listing and stock screens specified as two Ready items (`WI-CAT-007`, `CAT-008`; register 208) | 3.14 | 13 min | 474 |
| 2026-11-18 (fourth) | Opus 5.5 | the vendor's listing writes made safe in catalog and the BFF (`WI-CAT-007`; registers 208 and 210) and the vendor's listing and stock screens (`WI-CAT-008`), with the customer seeing each change on the real stack; an intermittent chaos test on a manual clock (register 211) | 16.88 | 45 min | 6,719 |
| 2026-11-19 | Opus 5.5 | the bootstrap of the dev environment in Azure: the Terraform state, the dev resource group and the pipeline identities' roles, checked and recorded (`WI-DEP-001`; registers 106, 108 and 213); nothing applied | 1.63 | 8 min | 188 |
| 2026-11-20 | Opus 5.5 | the dev environment applied in Azure and torn down: secrets boundaries, costs and a budget alert, the foundation, the real apply and teardown stages, three apply attempts and two teardowns, each failure fixed and recorded (`WI-DEP-001`; registers 107, 108, 201, 213 and 214); the apps not yet deployed | 13.78 | 56 min | 2,754 |
| 2026-11-20 (second) | Opus 5.5 | the dev application deploy built: images built with no credentials and pushed after the approval, the post-apply secret step, the app update refusing an older build, the seed behind a named switch as a job in the environment, and a post-deploy smoke (11 customer tests, latency) and observability evidence; dry-run locally, not yet run in Azure (`WI-DEP-001`; registers 216 to 226) | 13.19 | 45 min | 2,907 |
| 2026-11-20 (third) | Opus 5.5 | the first full dev deploy run's apply step, which stopped silently after the plan, diagnosed from the log and fixed: the shared Terraform setup takes the environment as an argument and names a missing foundation output; not yet rerun in Azure (`WI-DEP-001`; register 201) | 1.08 | 6 min | 82 |
| 2026-11-20 (fourth) | Opus 5.5 | the second full dev deploy run: the Container Apps environment never finished creating, so the apply stopped at Terraform's 30-minute limit and left it outside the state; teardown, manual delete on approval, group checked empty; create limit raised to 45 minutes, register 227; merged branches deleted (`WI-DEP-001`; register 201) | 1.01 | 5 min | 12 |
| 2026-11-21 | Opus 5.5 | the pre-push gates for the environment's 45-minute create limit, the activity log read (the stuck create ended after 77 minutes, a normal one took 14.5), and the push before the third full deploy run (`WI-DEP-001`; register 227) | 0.62 | 3 min | 8 |
| 2026-11-21 (second) | Opus 5.5 | build 88's evidence, the warm-up and cold-start measures, the UAT proposal with its decisions, both refactors (a shared environment module and a stage template, proved against the dev state), and the dev chaos plan with its first wave built and run on the local stack (`WI-DEP-001`, `WI-DEP-002`, `WI-CHAOS-006`; registers 227 to 229) | 21.75 | 1 h 8 min | 3,462 |
| 2026-11-21 (third) | Opus 5.5 | the UAT build in code (the ADR-0020 note, deployed-environment switches, the UAT Terraform root, the run inputs, the template's promote mode and the UAT pipeline file, not run), the dev run's sold-out seed listings fixed, and each environment its own pipeline identities, proposed (`WI-DEP-001`, `WI-DEP-002`; registers 218, 225, 229 to 231) | 11.81 | 39 min | 3,203 |
| 2026-11-21 (fourth) | Opus 5.5 | why dev build 93 skipped its smoke after a good deploy (a bare `succeeded()` counted the skipped apply), and the fix with its test (`WI-DEP-001`; register 232) | 0.81 | 4 min | 33 |
| 2026-11-21 (fifth) | Opus 5.5 | the UAT branch rebased with the smoke fix, dev able to run without the cache Redis (a dev-only switch, not yet run), the UAT identity sets confirmed, and the UAT bootstrap done in Azure: its group, state container, pipeline identities' roles and the foundation's UAT apps identity (`WI-DEP-001`, `WI-DEP-002`; registers 216, 217, 231 to 233) | 5.23 | 22 min | 474 |
| 2026-11-22 | Opus 5.5 | a dev destroy refused by the new identity check (merged before the role change), dev's deploy identity narrowed in Azure, dev run 100 without the cache Redis read and passed, the UAT pipeline's variables and gate rehearsal, the run parameters' descriptions shortened (`WI-DEP-001`, `WI-DEP-002`; registers 201, 216 and 231) | 2.49 | 12 min | 336 |
| 2026-11-22 (evening) | Sonnet 5.5 | the first deployed dev-chaos run read from the build logs (build 117) and its evidence written, the lead-machine latency run, the DEV tracing work item and steps 1 to 5 and 7 built offline (`WI-OBS-001`: Terraform, the collector, secrets and deploy steps, the pipeline input, the observe queries), the collector exiting on a plain placeholder found and fixed, the stale banners and the DEV and UAT teardown record (`WI-CHAOS-006`, `WI-OBS-001`, `WI-DEP-001`, `WI-DEP-002`; registers 201, 235 and 236) | 2.63 | 14 min | 765 |
| 2026-11-23 | Sonnet 5.5 | dev build 120 read from its logs (16 of 16, the concurrency test run), DEV tracing found to export nothing (the collector's short name did not resolve) and the fix proven live, the four chaos faults and a plain order read as traces, then the Terraform fix, the web server's `/api/graphql` span and the observe stage's wait built on a branch, not deployed (`WI-OBS-001`, `WI-CHAOS-006`; registers 236 and 237) | 1.61 | 10 min | 467 |
| 2026-11-23 (second) | Sonnet 5.5 | the DEV teardown's leftover action group (register 238), the latency budget and the dependency decisions (registers 100 and 162), a code review of the merged `WI-CAT-007` and `WI-CAT-008` with each finding confirmed or refuted and the real ones fixed (register 239), DEV run 123 read and two defects in the observe stage found against the live workspace (register 236), the image scan built, run and acted on (`WI-SEC-007`, register 240), the audit and image-scan pipeline jobs (`WI-SEC-006`), and two PRs gated and pushed | 3.84 | 20 min | 991 |
| **Total** | |  | **307.97** | **23 h 1 min** | **94,547** |

**By model** (added 2026-11-23, computed from the rows above; the model is the one named on the "Main model" line of each session's record): Sonnet 5.5 did 28 sessions, 158.12 relative cost, 14 h 29 min API time and 66,983 lines added, which is 2.36 relative cost per 1,000 lines added and 10.92 per API hour; Opus 5.5 did 21 sessions, 149.85 relative cost, 8 h 32 min and 27,564 lines, which is 5.44 per 1,000 lines and 17.56 per API hour. The lead's observation, for similar work, is that the biggest difference in using Opus was its relative cost, with some difference in performance. **These figures do not prove that.** The work was not matched: the Sonnet rows are mostly the feature and test building of 2026-10-31 to 2026-11-12, the Opus rows (2026-11-16 to 2026-11-22) are mostly the public review, the Azure deployment and its pipelines, where much of the effort is reading logs and writing records and few lines are added, so lines added is a poor yardstick; a session's size also varies much more than either model's mean. What the table does show is that the later sessions cost more per line and per hour of API time, that the model changed on 2026-11-16, and that the 2026-11-22 evening session and both 2026-11-23 sessions went back to Sonnet 5.5.

Read it with care. API time is the assistant working. Lines added are the screen's count and include documents and generated records. Over the same weeks the repository grew the specifications, decision records, tests and evidence records it holds now ([`STATUS.md`](../product/backlog/STATUS.md) has where each specification stands); not every item was built in a recorded session, so the table is not a cost per item. Nothing here compares with doing the work by hand.

## AI-assisted testing

A controlled experiment (a bounded requirement set, tests proposed under a task contract, results counted against a baseline) was planned in October and is **deferred by my decision (2026-11-08)**; `WI-QA-003` says so. The practice has been part of the work throughout, without a baseline:

- **The assistant proposes** test cases, edge cases, boundaries and mutations. Examples: the matching rules for allergen conflicts (`WI-SRCH-001`), the stock-status boundaries and every invalidation rule of the listing cache, each broken on purpose and shown to fail the intended tests (`WI-CAT-003`); generated-input tests with a fixed seed that found two defects in the BFF; mutation checks over slice 1 and in `WI-MOB-003`.
- **I decide** what is worth testing and how. I weighed in on the scenarios, directed that each scenario gets its own seeded user instead of one user whose preferences change at run time (lesson L-35), and decided what belongs in a test harness and what is the product's own business logic (lesson L-36, `WI-ORD-010`).

The open questions of that item are mostly about the process, planning and the rules for working with and delegating to AI, and those are recorded here, in the lessons and in the evidence.

## What is measured and what is not

Measured: test counts and line coverage ([the test report](../evidence/README.md)), a browser flake baseline, real-stack timings, a mutation sample, the number of errors found by each control, and now the cost, time and size of each recorded session (above). **Not measured:** time saved against a hand-built baseline, the cost of review and rework, and how many AI suggestions were accepted or rejected. The AI-assisted testing experiment in the October plan (`docs/management/portfolio-slice/02-vertical-slice-and-quality.md`) has not been run, so there is no baseline. The speed and value I describe are experience; to turn them into evidence, a baseline would be defined first.

## Not exercised

Concurrent agents; separate agent roles or permission tiers beyond the approval list; an automated audit trail of AI work beyond commit messages and the register; retrieval over documents (curated context sufficed); graded packet formats with a review checklist and a lifecycle (the seven packets used one format); generating a task from a work item automatically.

## Where it has been strongest here

In this repository the assistants have been strongest at wide reading and cross-checking (the October review read every tracked Markdown file and found drift in most of them), at writing and running verification (the real-stack journeys, the mutation sample, the clean-clone check), at reconciling specs against code, and at keeping the records current in the same change as the work. Those are also the places where the controls above matter most, because the output is persuasive whether or not it is right.

## A moving target

Models, tools and workflows are changing quickly, and so is what a good practice looks like. This record is a snapshot of one way of working. It should be re-read and revised when the assistant, the tooling or the workflow changes in a way that matters, and whenever the surprise rule ([surprise-rule.md](surprise-rule.md)) produces a lesson about working with AI (these go in [the lessons record](lessons.md) first). Things worth watching: changes in what the conventions file and persistent notes can do, what the assistant can verify for itself, how well it plans larger pieces of work, and whether the checks that catch its errors keep pace. The date at the top is the last time it was reviewed.

## Staged and hypothetical artifacts

For a project run by one person, some artifacts are necessarily staged: a hypothetical team and RACI, a staged incident and postmortem, a budget with no billing. They are real practice in a different sense: they show the artifact and how it would be used, and they are labelled as hypothetical. Here they are deferred or proposed specs (`WI-MGMT-003`, `WI-MGMT-006`, `WI-LAUNCH-002`), not silently missing.

## Questions this repository can answer

- **Can several agents coordinate?** Only sequential sessions have been tried; the shared-file rule and the register carried the coordination.
- **Is a separate "interfaces frozen" document needed?** Contract tests plus the first-slice contract served that role; there is no evidence either way for a separate document.
- **Retrieval or curated context?** Curated context won in practice: work items, `CLAUDE.md`, the register. Retrieval was never needed.
- **Should a practice become a skill?** The assistant's skills and memory were used for repeated working patterns; the records above stay the source of truth.

## Related

[Context completeness](context-completeness.md) · [the surprise rule](surprise-rule.md) · [status and supersession](status-and-supersession.md) · [quality gates](../process/quality-gates.md) · [the evidence index](../evidence/README.md)
