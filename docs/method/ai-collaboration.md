# AI collaboration in this repository

> **Status:** Current, expected to change · written 2026-10-30 from the repository's own records. It says how AI assistants are used here, what went wrong, and which control caught it. AI models and tooling are changing quickly, so this record is reviewed and revised as new information arrives (see "A moving target"). Its numbers are measurements; its judgments about speed and value are the lead's experience and are labelled as such.

The repository is an experiment in building a small product with AI assistants under human direction, while keeping practice and technology current. The lead decides and approves; AI assistants draft, implement, verify and record. Most of the code and documentation was written by an assistant (Claude Code in interactive sessions, after an earlier phase of planning in chat) and reviewed by the lead.

**The lead's experience** (not a measurement): the assistants have been very productive and have saved a lot of time, they catch errors (including each other's and the lead's) as well as make them, and the iterations through this way of working have gone much faster than the lead expected. That is the reason to keep the way of working under review rather than treat it as settled.

## How the work is organised

- **One conventions file, `CLAUDE.md`.** It tells every session what the project is, which commands to run, the architecture rules, and the working conventions. Rules in it that matter most for AI work: do not describe anything as working unless it was run; report passed, failed, skipped and not-run results separately; work items are the unit of work; the register is updated in the same change that finds a problem; shared files have one editor at a time.
- **Human approval required** for security, auth logic, IAM and RBAC changes, and before expanding the scope of a work item or refactoring code (`CLAUDE.md`). The assistant stops and asks at those points. For decisions that are not on that list and have a conventional default, it picks the default, says so, and continues.
- **Sequential sessions only.** Several sessions have worked on the repository over time, one at a time. No two agents have edited it concurrently, and the shared-file rule exists so that this stays safe.
- **Durable records, not conversation.** Status lives on the spec banner and in `STATUS.md`; decisions in ADRs; unresolved findings in the register; runs in `docs/evidence/`; what happened in commit messages that each name a work item. A new session starts from those, not from memory of an earlier one.
- **Short persistent notes** outside the repository carry the lead's working preferences between sessions (how branches and pushes are handled, that findings go in the register in the same change, the priorities). They are not a substitute for the records above.

## How delegated work is specified

[Context completeness](context-completeness.md) describes what a delegate needs and how it varies. Two phases of delegation happened here.

- **September 2026: packets.** Seven packets were handed to agents that had repository access (`docs/history/sept-2026-delegation/`). A packet is a self-contained brief and goes well beyond a work item's reference list. It carries instructions (what to build and how to approach it), guidelines (conventions, what to do when something is ambiguous), limits (scope boundaries in full, what to leave alone, what needs approval), the status of related work as a fact, which other packets are truly independent, known drift risks, the definition of done and how to hand the result back; it points at, rather than restates, anything the agent can look up, and names the work item that holds the full spec. They were grouped by shape: a solo packet for a blocking item, a pair when the task shape matched and no code was shared.
- **October 2026: interactive slices.** Slice 1 was built in interactive sessions with the lead, against ready work items, with no packets. The approval list, the register rule and the verification below did the work that packet scoping did before.

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
| This reconciliation, October 2026 | A time for a whole browser journey was compared with the time of a single call; a squash merge was assumed to keep early commits out of `main` when older commits were already there; the surprise rule was substituted for context completeness; one approved mutation check was missing from the first batch | Writing the ADR note; reading the branch history; the lead's review; tallying against the approved list |
| A new script (`secret-scan.mjs`), 2026-10-30 | It was committed without running Prettier, whose check in the `web` job covers `scripts/` | The Azure format check; the cure is `scripts/ci/node-gates.mjs` (register item 95) |
| A pasted pipeline error, 2026-10-30 | A fix was pushed to a branch whose pull request the lead was still reviewing, against the rule to fix locally and push once when agreed | The lead; a permission prompt on `git push` was added as a backstop |
| Writing a record, 2026-10-30 | A heredoc with backticks in it ran the backticked commands, including a 10-run test job, instead of writing them | The command timing out; the job was stopped and nothing in the tree had changed |
| Writing evidence, 2026-10-30 | Text stated more than was measured: "flat, no drift" for runs that fell from 34.2 s to 31.4 s; a status listed as stale that did not state one; a cause for a 7 s timing that was not checked | Re-reading the claim against the output before committing |
| A Compose variable, 2026-10-31 | A new service in the optional `apps` profile used `${ORDERING_CLIENT_SECRET:?...}` (required). Compose checks every variable in the file, including services that were not selected, so the pipeline's step that only starts Redis failed on a clean agent with no `.env`. It passed on the development machine because `.env` exists there | The Azure pull-request run (a clean agent), as in the earlier local-state findings; reproduced locally with an empty `--env-file`, fixed with an empty default (the service then stops at start-up and names the missing setting) |

Seven of the ten test episodes were found by the clean Linux pipeline or container run and not on the development machine (`docs/evidence/test-reliability/findings.md`).

## The controls that did the catching

- **A clean agent early.** Azure Pipelines, and `node scripts/ci/linux-check.mjs` for the .NET steps, because the development machine is Windows in one time zone with state left behind.
- **Real-stack journeys** against the real services, issuer, database and event stream, not only mocks.
- **Repeated runs as the bar for a fix.** "Five in a row" is a rule of thumb, not a statistic; the mock browser suite has since been run 10 times (570 executions, 0 failures).
- **Mutation checks.** A test is not evidence until it can fail. About ninety were run by hand over slice 1; the 2026-10-30 sample of 10 killed 9 and found one that tested the framework, not the project's code. No automated mutation tool is used.
- **Contract tests against the real dependency**, with the known caveat that some fall back to fakes when the dependency is absent.
- **Human approval gates** and the rule that the assistant stops at scope expansion.
- **Reconciliation of specs against code,** and the rule that a spec describes what is true now.
- **Reporting results as passed, failed, skipped or not run,** so a summary cannot hide a skip.
- **Not yet enforced:** the documentation status check and link check run only when someone remembers (register item 90).

## Working conventions with the assistant

What has worked in this repository, stated as practice:

- State assumptions before drafting a decision, so the lead can redirect early.
- Say whether a request is analysis (read and report) or generation (write files); do not edit during analysis.
- Inspect before editing and run before claiming. Report failures and skips as plainly as passes.
- Keep scope narrow. If something needs a larger change, stop and flag it.
- When a PR check fails, do not push a fix per error: reproduce locally, run every gate on the final tree, and push once.
- Record what was found and not fixed, in the same change.
- Do not push a branch whose earlier commits contain material that should not be public; push a squashed branch.
- On a Windows development machine with a bash-like shell: write a long script to a file and run it, because long heredocs containing quotes fail to parse; the shell may reset to the repository root between commands, so use absolute paths; Git warns that line endings will change, which is expected (`.gitattributes` normalizes them).

## What is measured and what is not

Measured: test counts, a browser flake baseline, real-stack timings, a mutation sample, the number of errors found by each control. **Not measured:** time saved, the cost of review and rework, how many AI suggestions were accepted or rejected. The AI-assisted testing experiment in the October plan (`docs/management/portfolio-slice/02-vertical-slice-and-quality.md`) has not been run, so there is no baseline. The speed and value described by the lead are experience; to turn them into evidence, a baseline would be defined first.

## Not exercised

Concurrent agents; separate agent roles or permission tiers beyond the approval list; an automated audit trail of AI work beyond commit messages and the register; retrieval over documents (curated context sufficed); graded packet formats with a review checklist and a lifecycle (the seven packets used one format); generating a task from a work item automatically.

## Where it has been strongest here

In this repository the assistants have been strongest at wide reading and cross-checking (the October review read every tracked Markdown file and found drift in most of them), at writing and running verification (the real-stack journeys, the mutation sample, the clean-clone check), at reconciling specs against code, and at keeping the records current in the same change as the work. Those are also the places where the controls above matter most, because the output is persuasive whether or not it is right.

## A moving target

Models, tools and workflows are changing quickly, and so is what a good practice looks like. This record is a snapshot of one way of working. It should be re-read and revised when the assistant, the tooling or the workflow changes in a way that matters, and whenever the surprise rule ([surprise-rule.md](surprise-rule.md)) produces a lesson about working with AI (these go in [the lessons record](lessons.md) first). Things worth watching: changes in what the conventions file and persistent notes can do, what the assistant can verify for itself, how well it plans larger pieces of work, and whether the checks that catch its errors keep pace. The date at the top is the last time it was reviewed.

## Staged and hypothetical artifacts

For a project run by one lead, some artifacts are necessarily staged: a hypothetical team and RACI, a staged incident and postmortem, a budget with no billing. They are real practice in a different sense: they show the artifact and how it would be used, and they are labelled as hypothetical. Here they are deferred or proposed specs (`WI-MGMT-003`, `WI-MGMT-006`, `WI-LAUNCH-002`), not silently missing.

## Questions this repository can answer

- **Can several agents coordinate?** Only sequential sessions have been tried; the shared-file rule and the register carried the coordination.
- **Is a separate "interfaces frozen" document needed?** Contract tests plus the first-slice contract served that role; there is no evidence either way for a separate document.
- **Retrieval or curated context?** Curated context won in practice: work items, `CLAUDE.md`, the register. Retrieval was never needed.
- **Should a practice become a skill?** The assistant's skills and memory were used for repeated working patterns; the records above stay the source of truth.

## Related

[Context completeness](context-completeness.md) · [the surprise rule](surprise-rule.md) · [status and supersession](status-and-supersession.md) · [quality gates](../process/quality-gates.md) · [the evidence index](../evidence/README.md)
