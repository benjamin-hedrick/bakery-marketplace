# Lessons record

> **Status:** Current, grows as lessons are learned · started 2026-10-30. Each entry is something learned from doing the work, with the evidence and what changed. Lessons come from the [surprise rule](surprise-rule.md): when something unexpected shows up and is worth keeping, it is written here. Open ideas and deferred work are not lessons; they go in the [register](../governance/open-items-register.md) or the specs.

**Status values:** *Observation* (seen once), *Hypothesis* (a likely lesson not yet tested), *Validated* (the evidence supports it), *Adopted* (and the way of working changed), *Open* (keep watching), *Rejected* (tried or considered and dropped). Evidence is a file in this repository; where nothing was measured, the entry says so.

| ID | Lesson | Status |
|---|---|---|
| L-01 | A surprise is a trigger to ask what should change | Adopted |
| L-02 | Settling decisions before building reduces rework | Validated by examples, not quantified |
| L-03 | Complete, bounded context beats a large volume of context | Adopted, not measured |
| L-04 | Written records let a new session resume without the old one | Validated |
| L-05 | A complete local environment is both a delivery strategy and evidence | Validated for rebuild time |
| L-06 | Governance should be proportional to risk | Adopted informally |
| L-07 | Stating whether a task suits an agent should be explicit | Open |
| L-08 | A clean agent finds what the development machine hides | Adopted |
| L-09 | A test is not evidence until it can fail | Adopted by hand |
| L-10 | A fact written in many places drifts; generate one | Adopted; the checks run in the pipeline as a soft gate |
| L-11 | Handoffs fail in three ways; state each fact in the handoff | Adopted |
| L-12 | Do not push a fix per failure; run every gate once | Adopted |
| L-13 | Check an assumption about history before relying on it | Adopted |
| L-14 | Restate a subtle concept before documenting it | Adopted |
| L-15 | A measurement must travel with what it measures | Adopted |
| L-16 | Deferred is not Obsolete | Adopted |
| L-17 | Trackers outlive the way of working that made them | Open |
| L-18 | Name the axis: environment target or fallback chain | Adopted in part |
| L-19 | Mark each rule as a hard invariant or a guided default, with how it is verified | Open |
| L-20 | Read everything before judging; keep a manifest and a facts sheet | Adopted |
| L-21 | Tie each work item to the ADRs and NFRs it affects | Hypothesis (proposed 2026-11-02) |
| L-22 | Review the security-sensitive part before building it, not only after | Hypothesis (proposed 2026-11-02) |
| L-23 | Chain commands with `&&` so a failed edit cannot be followed by a long run | Observation |
| L-24 | Write files and edit scripts with the Write tool, not through a shell heredoc | Adopted (2026-11-06, in `CLAUDE.md`) |
| L-25 | Give every wait in a test a time limit, so broken code fails the test instead of hanging it | Observation (one case, applied there) |
| L-26 | A mock must answer the way the real service does, or the test passes or fails for the wrong reason | Observation |
| L-27 | When a screen's layout moves while it loads, an automated tap can land on the wrong control: wait for the thing that moves | Observation |
| L-28 | Invalidate a cache on what the reader can see, not on every write | Validated by tests and a measurement, one design |
| L-29 | Check that a mutation check really ran, and commit before you break the code | Observation (twice) |
| L-30 | Check a comment that states a rule against the code that enforces it | Observation |
| L-31 | Take the date from the system and the remote branch list from the remote | Observation (two slips, one session) |
| L-32 | Size a fixed placeholder from the real worst case, and run the flows around the state it holds | Observation |
| L-33 | A survival assertion passes with the fault off: assert from the record that the fault happened first | Validated (found two weak tests) |
| L-34 | Test the ambiguous failure, not only the failure before the call: the work was done and the answer was lost | Validated (found two unsafe retries) |
| L-35 | Read what each environment's configuration really says before writing a gate on its name | Observation |
| L-36 | Two languages stay in step through shared data checked by both, not through two copies kept by hand | Adopted (chaos scenarios) |
| L-33 | Stop a recorder before the thing it records goes away, and measure a still screen by the clock | Observation |
| L-34 | Mark in the file itself what has never been run | Observation |
| L-35 | Test state belongs in seed data: add users, do not change one user at run time | Validated by the flows that use it |
| L-36 | A test harness drives the system from outside; the rules stay in the product | Observation, one case |
| L-37 | "Comprehensive" means every file read in full, with a finding or "no finding" for each | Observation, corrected by the lead |

## L-01 A surprise is a trigger to ask what should change

**Situation.** The service mapping, the zero-trust posture, stock ownership and service-to-service authentication were all discovered after work had started. **Lesson.** Treat the discovery as the signal: ask whether a process, policy or artifact should have covered it, and whether to change something to do better next time. **Evidence.** [surprise-rule.md](surprise-rule.md) lists eleven cases and their outcomes; ADR-0009, ADR-0017 and ADR-0018 started this way. **Change.** The rule is a method document, and on 2026-10-30 it was widened from "add the missing artifact" to any step and any kind of work, with a process change as one possible outcome. **Status.** Adopted.

## L-02 Settling decisions before building reduces rework

**Situation.** Four services were scaffolded before the mapping existed (ADR-0009 followed); several specs described designs that were later changed and had to be rewritten (the cart endpoint, the order lifecycle). **Lesson.** Decisions found late cost a rewrite; decisions settled early cost a note. **Evidence.** The seven specs rewritten in October 2026 (`status-and-supersession.md`) and ADR-0009. **Not shown.** The effort saved was never measured, so this is supported by examples, not by numbers. **Status.** Validated by examples.

## L-03 Complete, bounded context beats a large volume of context

**Situation.** Work items carry a capped, categorized reference list and an explicit "you do not need to know about"; packets state limits and point at what can be looked up. **Lesson.** The aim is context that is complete for the task, not large. **Evidence.** The template and the Definition of Ready encode it; slice 1 was built from items written this way ([context-completeness.md](context-completeness.md)). A September packet that lacked a stated fact (the status of earlier work) shows the cost of a gap. **Not shown.** No controlled comparison with unbounded context was run. **Status.** Adopted, not measured.

## L-04 Written records let a new session resume without the old one

**Situation.** Sessions are separate, and the assistant does not remember the last one. **Lesson.** Durable records (status banners, the register, evidence, a written resume file) carry the continuity. **Evidence.** The latest session of this reconciliation resumed from `docs/history/review-2026-10/60-resume-here.md` and the repository state alone, and finished eleven steps of the plan from it. **Status.** Validated.

## L-05 A complete local environment is both a delivery strategy and evidence

**Situation.** The whole stack (services, database emulator, event stream, identity issuer, browser journeys) runs locally. **Lesson.** It lets the work be verified end to end before anything is deployed, and it is reproducible. **Evidence.** A fresh clone reached a healthy stack in about 91 seconds with image and package caches warm, and 21 journeys passed against it (`docs/operations/local-dev.md`); reset is `docker compose down` and `up`. **Not shown.** A first run with nothing cached was not timed. **Status.** Validated for rebuild time.

## L-06 Governance should be proportional to risk

**Situation.** Almost all work proceeds on the assistant's judgment; a short list needs the lead's approval (security, auth logic, IAM and RBAC, scope expansion, refactoring). **Lesson.** Gate the few high-risk decisions, not every change. **Evidence.** `CLAUDE.md`; ADR-0018 held at Proposed until its verification list is run; the auth change in register item 85 waits for approval. **Not adopted.** Formal permit-to-build and permit-to-operate records were considered; the same substance is in the ADRs and the slice-1 evidence, so no separate form is used. **Status.** Adopted informally.

## L-07 Stating whether a task suits an agent should be explicit

**Situation.** Every work item has an "AI-agent suitability" field with a reason and the decisions an agent must flag. **Lesson.** Unknown: whether the field reduces failed or over-scoped assignments. **Evidence.** The field exists on every spec; no comparison of outcomes with and without it was made. **Status.** Open.

## L-08 A clean agent finds what the development machine hides

**Situation.** Tests passed on a Windows machine and failed on the Linux pipeline. **Lesson.** Run every change on a clean machine early. **Evidence.** Seven of ten episodes between 2026-10-26 and 2026-10-29 were found there (`docs/evidence/test-reliability/findings.md`), including a real portability bug in token-endpoint validation. **Change.** `scripts/ci/linux-check.mjs` and the Azure pipeline. **Status.** Adopted.

## L-09 A test is not evidence until it can fail

**Situation.** Tests were written by an assistant and looked right. **Lesson.** Break the code on purpose and check the named test fails. **Evidence.** About ninety hand-made mutations during slice 1; the sample of 10 on 2026-10-30 killed 9 and found one that tested the framework instead of the project's code (register 85); the Cosmos adapter tests pass without touching Cosmos (register 31). **Not done.** No automated mutation tool. **Status.** Adopted by hand.

## L-10 A fact written in many places drifts; generate one

**Situation.** Status, test counts and ADR counts were retyped in many documents, and most documents read in October were stale somewhere. **Lesson.** One source per kind of fact, generated where possible, with a check. **Evidence.** The October review; the generated `STATUS.md`. **Change.** `scripts/docs/status.mjs`. **Still open.** The status, traceability and link checks run in `node scripts/ci/node-gates.mjs` and in the pipeline's `docs` job, which is a soft gate the lead reads (register 90); the prose mentions of a status are still unchecked (register 99). **Status.** Adopted; the check is a soft gate.

## L-11 Handoffs fail in three ways; state each fact in the handoff

**Situation.** A spec went stale against its source, two sessions claimed one identifier, and a status decision was left for the agent to infer. **Lesson.** Point to the decision as well as the spec, search before assigning an identifier, and state the status of related work as a fact. **Evidence.** [ai-collaboration.md](ai-collaboration.md), with the September packets. **Status.** Adopted.

## L-12 Do not push a fix per failure; run every gate once

**Situation.** Fixing failing PR checks one push at a time queued runs behind each other, and a failed step skips later steps, so remaining failures stayed hidden. **Lesson.** Reproduce each failure locally, run every pipeline gate on the final tree, and push once. **Evidence.** The lead's instruction during the first Azure runs; `docs/process/branching-strategy.md`. **Status.** Adopted.

## L-13 Check an assumption about history before relying on it

**Situation.** During this reconciliation the assistant assumed a squash merge would keep early commits out of `main`. **Lesson.** Past pull requests had been merge commits and older commits were already in `main`; a merged pull request also keeps every pushed commit reachable. **Evidence.** The branch history; `docs/process/branching-strategy.md`; register item 93. **Change.** Push a single squashed branch, not the working branch. **Status.** Adopted.

## L-14 Restate a subtle concept before documenting it

**Situation.** The assistant treated context completeness and the surprise rule as one idea and replaced one with the other in several documents; the lead pointed out they are different (proactive versus reactive), and later that the goals of completeness (self-contained work, no repeated analysis, no rework) and the breadth of the surprise rule had been left out. **Lesson.** An assistant tends to merge neighbouring ideas and to describe a concept by its most visible mechanism. Before writing a subtle concept into a document, restate it back and get it confirmed, and write down the purpose, not only the mechanism. **Evidence.** The commits correcting the glossary, [context-completeness.md](context-completeness.md) and [surprise-rule.md](surprise-rule.md). **Status.** Adopted.

## L-15 A measurement must travel with what it measures

**Situation.** A time for a whole browser journey (9.7 s) was compared with the time of one checkout call (4.7 s). **Lesson.** Always name what a number times; compare like with like. **Evidence.** The correction in `docs/evidence/baseline-2026-10-30.md` and the ADR-0013 note. **Status.** Adopted.

## L-16 Deferred is not Obsolete

**Situation.** The sprint plan was first marked Obsolete after the decision to work iteratively without sprints. **Lesson.** An artifact that is valid but not needed now is Deferred, with the trigger that would bring it back; Obsolete means cancelled for good. **Evidence.** `WI-PLAN-002`; the status definitions in `status-and-supersession.md`. **Status.** Adopted.

## L-17 Trackers outlive the way of working that made them

**Situation.** The activity log broke when many branches prepended to it; the parking lot dates from September and now overlaps the register and the deferred specs. **Lesson.** Review how items are tracked as the way of working changes, not only the items. **Evidence.** Register item 50 (resolved: the log was closed); `WI-REPO-003` (the review of the parking lot and the intake of delegated-work findings). **Status.** Open.

## L-18 Name the axis: environment target or fallback chain

**Situation.** The ADRs use "local fallback" for two decisions: which implementation an environment uses, and what a running system degrades to. Some adapter tests chose a fake when the real dependency was absent and still reported green. **Lesson.** Choose the environment target explicitly and fail loudly; allow a silent substitution only as a bounded, logged, tested fallback chain. **Evidence.** [patterns](../architecture/patterns.md) ("Two meanings of fallback"); register items 31, 35 and 73. **Change.** The services refuse to start without an explicit events backend; the catalog's silent fallback was removed. **Not done.** The adapter tests still fall back to fakes without saying so. **Status.** Adopted in part.

## L-19 Mark each rule as a hard invariant or a guided default, with how it is verified

**Situation.** `CLAUDE.md` and the process documents mix rules with no exceptions and strong defaults without saying which is which, and many rules are verified only by someone remembering. **Lesson.** Mark the kind, name the verification, and treat a hard invariant verified only by review as a gap. **Evidence.** [rule-authoring.md](rule-authoring.md) classifies eighteen rules; several hard invariants have no check that is enforced automatically. **Not done.** The rules in `CLAUDE.md` are not marked yet (needs the lead's approval). **Status.** Open.

## L-20 Read everything before judging; keep a manifest and a facts sheet

**Situation.** The first passes of the October review sampled documents (headers, searches, counts). Their findings stood, but "no finding" only meant "not checked", and the full read overturned several (a document wrongly flagged, one at the repository root missed and then wrongly called missing). **Lesson.** For a review, read every file and keep a manifest of what was read, so completeness is checkable; build a facts sheet from commands that were run (test counts, endpoints) so documents quote it and not memory. **Evidence.** `docs/history/review-2026-10/00-manifest.md`; `docs/evidence/facts-sheet-2026-10-29.md`. **Status.** Adopted.

## L-21 Tie each work item to the ADRs and NFRs it affects

**Situation.** NFR 3.3 said CSRF was "not applicable" on a condition (no cookie token storage) that `WI-AUTH-007` ended; the section stayed wrong until 2026-11-02. **Lesson.** The Definition of Done said "docs affected are updated", but no item listed the NFRs, so nothing prompted the edit. **Evidence.** `nfrs.md` section 3.3 history; register item 130. **Change.** Proposed: an "ADRs and NFRs affected" line in the work item template and the Definition of Done. **Status.** Hypothesis until the lead adopts it and a later item shows it worked.

## L-22 Review the security-sensitive part before building it, not only after

**Situation.** The agent's own security reads of `WI-QUE-003` found real flaws late: the BFF counted a stream before reading its body (found after five steps), the web route had the same flaw and no per-session limit, and a client that stops reading held a stream open. **Lesson.** An adversarial pass on the design, with abuse cases as acceptance criteria, is cheaper than the same finding after the code. **Evidence.** Register items 126 and 130; the review rounds recorded in `WI-QUE-003`. **Not shown.** That the earlier pass would have caught them; the author agent still did both reads. **Status.** Hypothesis.

## L-23 Chain commands with `&&` so a failed edit cannot be followed by a long run

**Situation.** During `WI-QUE-003` a failed edit was followed by a long test run on the unchanged code, three times. **Lesson.** Join an edit and the run that depends on it with `&&` (or run them as one script), and don't keep Docker state between evidence runs (`--keep`). **Evidence.** Register item 130, finding 6; no measurement of the time lost. **Status.** Observation.

## L-24 Write files and edit scripts with the Write tool, not through a shell heredoc

**Situation.** Edits made through shell heredocs failed in several ways between 2026-10-30 and 2026-11-06. Backticks in an unquoted heredoc ran as commands (a 10-run test job started instead of a document being written). Long quoted heredocs with apostrophes and braces failed to parse. Backslash escapes in Python or `sed` run from the shell were rewritten before they ran (`\n` became a real newline, `\/` an invalid escape, a Unicode escape in a regular expression the literal character), which broke edit scripts and, once, a script file. A chained fetch and push produced a permission prompt labelled "fetch" that also approved the push. **Lesson.** Write documents with the Write tool. Write an edit script as a file with the Write tool and run it with `python <path>`, with an assertion that each target occurs exactly once, so a script that stops midway is visible. Use Edit for single changes. Run `git push` as its own command. **Evidence.** The assistant's feedback memory `feedback-shell-heredocs` (updated 2026-10-31, 2026-11-04 and 2026-11-06); commits that repeated work after a failed script. **Status.** Adopted: one line in `CLAUDE.md` working conventions, which is guidance and has no automated check.

**Added 2026-11-07.** The lead explained what the rule is for: avoiding escaping errors (backticks, quotes, backslashes, encoding) and the difference between creating text and executing anything inline. Speed is not the point, because Write and Edit cost about the same. The assistant still slipped several times in one session by appending prose with `printf >>`, inserting a line with `sed -i` and running an empty heredoc. The text was safe each time, so no harm came of it, but it is the pattern the rule forbids; a rule that is only guidance is followed from habit, not enforced.

## L-25 Give every wait in a test a time limit, so broken code fails the test instead of hanging it

**Situation.** In the listing cache tests (`WI-CAT-003`), one test held a load open and then waited for a second request. With the code deliberately broken in a mutation check, the second request joined the held load and waited forever; the test run hung for more than five minutes and left a test host process alive. **Lesson.** Any `await` in a test that depends on the code under test making progress needs a limit (`WaitAsync(TimeSpan.FromSeconds(5))`), so the broken case is a failure with a message, not a hang. **Evidence.** `ListingCacheTests.ARequestAfterAWriteDoesNotJoinALoadThatBeganBeforeIt` (commit `4de3e19`); the rerun of the same mutation failed in 5 seconds. **Status.** Observation: one case, fixed where it was found.

## L-26 A mock must answer the way the real service does, or the test passes or fails for the wrong reason

**Situation.** A test of the web app's `Cache-Control` for the GraphQL route failed because the mock BFF sent no `Cache-Control` while the real BFF sends `private, no-store` on every response, so the test was not checking what it claimed. Earlier in the same session the mock BFF's order status could not change after a test had placed an order, until a control was added. **Lesson.** When a test needs a header, a status or a failure from a mock, check that the real service does the same (the real BFF's own tests are the reference), and add the behaviour to the mock deliberately; say in the test what is the mock's and what is the app's. **Evidence.** `apps/web-customer/mock-bff/server.mjs` (the `cache-control` on GraphQL answers, the order, stock and failure controls); `cache-headers.spec.ts`. **Status.** Observation.

## L-27 When a screen's layout moves while it loads, an automated tap can land on the wrong control: wait for the thing that moves

**Situation.** A new Maestro flow tapped "Place order" right after the checkout opened. The saved payment methods loaded a moment later and pushed the button down, so the tap landed on a payment button and chose the refused test card; the order was refused and the flow failed on a later assertion about the order page. The other flows had always tapped a pickup time first, which gave the list time to load. **Lesson.** In a UI flow, wait for the element that appears and moves the layout (`assertVisible` on the list) before tapping what sits below it, and choose the option explicitly instead of relying on a default. The same shift could catch a person, so it is recorded as a usability finding. **Evidence.** `13-cancel-order.yaml` (first run failed, second passed); register item 161. **Status.** Observation.

## L-28 Invalidate a cache on what the reader can see, not on every write

**Situation.** The listing cache holds each vendor's listings with their exact stock quantity, but customers see only a status (in stock, low, sold out). Invalidating on every sale would have emptied the cache of a busy vendor constantly. **Lesson.** Work out what the reader can observe and invalidate on a change of that; here a sale that leaves the status alone does not invalidate, the cached count drifts, and nothing a customer sees uses it because checkout's atomic reservation is the authority. Tests must show both sides: it invalidates on the change of status, and it does not on the change that cannot be seen. **Evidence.** `WI-CAT-003` (tests for a sale from 500, into low, to sold out and back, and the mutation checks that failed the intended tests); browse p50 about 20 ms without the cache and about 3 ms with it, three runs each. **Status.** Validated by tests and a measurement, for one design.

## L-29 Check that a mutation check really ran, and commit before you break the code

**Situation.** A mutation check (break the code, see the test fail, restore it) went wrong twice: on 2026-11-04 one applied backwards and passed by mistake until it was redone; on 2026-11-07 one failed to build, so nothing was evaluated, and a command that ended with `git checkout --` on a file with uncommitted work was refused and would have thrown that work away. One run printed 15 tests where 23 were expected, which showed it had not run properly. **Lesson.** Commit first, break the code with an edit, run, restore with an edit, and check the test count and that the failure is the intended one; a green run of a mutated build proves nothing until you know the build and the test selection were what you meant. **Evidence.** The mutation checks recorded in `WI-CAT-003`, `WI-CUST-009` and register 159; the memory note `project-usage-log` (what cost time, 2026-11-04 and 2026-11-07). **Status.** Observation (twice).

## L-30 Check a comment that states a rule against the code that enforces it

**Situation.** The BFF schema comment for the new customer `cancelOrder` mutation said another role would be refused with FORBIDDEN. Ordering's cancel endpoint accepts either role and decides who is acting from who owns the order, so a vendor's token on its own order is a vendor cancel; the BFF only forwards the token. The comment was written from the intent, not from the code, and was found only because a real-stack test was being planned. **Lesson.** A comment, a spec or a schema description that states who may do what should be written from the code that decides it (here the ordering service's action endpoint), and checked there when it is written. **Evidence.** The correction in `services/graphql-bff/schema/schema.graphql` and `WI-ORD-011`. **Status.** Observation.

## L-31 Take the date from the system and the remote branch list from the remote

**Situation.** On 2026-11-07 the assistant wrote "2026-11-08" in about ten documents and a code comment for work done that day, which needed a separate correction commit. The same day it told the lead that three merged branches still existed on GitHub and offered to delete them; they did not: it had only seen stale remote-tracking references after a `git fetch` without `--prune`. **Lesson.** Use the date the environment gives (a UTC timestamp from a script can be a day ahead of the local date), and confirm remote state with `git fetch --prune` and `git ls-remote --heads origin` before stating it. **Evidence.** Commit `ec47b70` (the date correction); the memory note `feedback-check-date-and-live-remote`. **Status.** Observation.

## L-32 Size a fixed placeholder from the real worst case, and run the flows around the state it holds

**Situation.** The fix for register 161 (the Android checkout's list of payment methods moving the place button) first reserved room for three methods and put every state in the area, though the seeded customers have at most two. The extra height pushed "Place order" below the fold when the rejection notice was showing, and flow 11 failed on a tap. The second version reserved two rows for the loading line and the list only and left the notices outside. **Lesson.** A placeholder that stops one layout shift can cause another; size it from the data's real maximum, keep it to the states that need it, and run the flows that pass through the neighbouring states (here a rejection) after the change. **Evidence.** Flow 11's failure screenshot and the second run (11, 13-cancel-order and 13-no-payment-methods passed); register 161. **Status.** Observation. Not shown: that the button no longer moves (Maestro cannot assert a position).

## L-33 Stop a recorder before the thing it records goes away, and measure a still screen by the clock

**Situation.** The screen-capture spike for the demo film found three things at once. The emulator recorder writes frames only when the screen changes, so a chunk of 181 seconds of wall time held 117 seconds of video. It stops after three minutes, so it writes chunks. And its last chunk is only pulled after it ends, so when the flows script took the emulator down first, that footage was lost. **Lesson.** Put the recorder's stop and pull before the teardown of what is recorded, record each chunk's wall-clock start so a compositor can re-time it, and start recording after the system is ready, not while it boots. **Evidence.** `scripts/dev/film/record-phone.mjs`; register 163. **Status.** Observation.

## L-34 Mark in the file itself what has never been run

**Situation.** The demo film's director, its phone flow and the video composer were written in a session that was not going to record anything. Only the dry run, the composer on synthetic input and the Maestro syntax check could be run. **Lesson.** Say so where the next reader will look: in each file's header ("written, never run; expect to fix selectors and timings on the first run"), in the plan document's "checked and not checked" table, in the register item and in the scripts index, with the first runs listed in order. A script that looks finished invites trust it has not earned. **Evidence.** `scripts/dev/film/film.mjs` header, `docs/operations/demo-film.md`. **Status.** Observation.

## L-35 Test state belongs in seed data: add users, do not change one user at run time

**Situation.** The first Android allergen flows reused one customer and changed that customer's allergen profile at run time, through an endpoint on the flow-control server that existed only for the test. The lead's direction was to add users instead of reusing one and changing its preferences. **Lesson.** Each state a flow needs is a named, self-describing seeded user (Nora: tree nut; Sam: sesame; Dana: avoids dairy; Max: dairy and tree nut, avoids gluten; Nia: no saved payment method), so a flow only logs in, and nothing in the product exists to set state for a test. A new scenario that needs a new state gets a new user, and its stock and orders are budgeted so flows do not disturb one another. **Evidence.** Commit `13f9e97` (the six allergen flows log in as seeded customers; the profile endpoint is removed from the control server; 10 of 10 flows pass), register item 150, the rule in `CLAUDE.md` of 2026-11-04, `docs/evidence/WI-MOB-002/`. **Status.** Validated by the flows that use it.

## L-36 A test harness drives the system from outside; the rules stay in the product

**Situation.** A declined payment was forced by a switch: a header, an environment flag and a branch in the payment stub that existed so tests could refuse an order. The lead decided that validating a payment method is business logic and belongs in the product: ordering validates the method's token, and a decline is a seeded payment method that fails the rule. **Lesson.** For each test aid, ask whether it reaches the system from outside (a runner, a stack script, seed data) or adds a branch to product code. The first is a harness and is fine; the second is moved into data or an interface that already exists. Where a test needs a behaviour, give the product the rule and the test the data. **Evidence.** Register item 150 (part 2), `WI-ORD-010` (reconciled with the lead's answers on 2026-11-06: token validation as ordering business logic), `tools/tests/BakeryMarketplace.Seed.Tests`, which checks the seeded methods against ordering's rule. **Status.** Observation, one case.

## L-37 "Comprehensive" means every file read in full, with a finding or "no finding" for each

**Situation.** The lead asked for a full pass over the repository before it is made public. The first folder pass read status lines, dates and numbers, sampled the specs and listed most of the remaining files for "a second pass", and the findings tables said "accept or read later". The lead corrected it: "we shouldn't be skimming or sampling, read and analyze them all". **Lesson.** When a task says comprehensive, full, every or all, build the inventory first (the count of files), read each file in full, record a finding or "no finding" per file, and say how many were read of how many. Do not defer files without the lead's agreement, and analyse every area before editing any of it. **Evidence.** The reading ledger of the pass (343 of 343 Markdown files read; the findings it produced are the commits that follow it), and the October review, whose own record says "sampling is not review" (`docs/history/review-2026-10/60-resume-here.md`, section 10). **Change.** The assistant's working notes; this entry. **Status.** Observation, corrected by the lead; the October review had already learned it once.

## L-33 A survival assertion passes with the fault off: assert from the record that the fault happened first

**Situation.** The first Redis chaos tests said "every message is handled after redelivery" with handlers failing half the time. They passed with the chaos switched off, because that statement is also true when nothing fails. A mutation check (injection disabled) showed it for two of six tests. **Lesson.** A test of a system's behaviour under an injected fault needs a record the injector keeps (here the chaos journal) and must assert from it that the fault happened, before asserting the system coped; the tests that could pass without the fault are not evidence. **What changed.** Every chaos test now asserts the journal first (rule in `chaos/README.md` and ADR-0024), and each layer was mutation-checked. *Status: validated, one project.*

## L-34 Test the ambiguous failure, not only the failure before the call: the work was done and the answer was lost

**Situation.** The first chaos layers only failed before the real call. Adding a "lost response" fault (the call is made, then the caller is told it timed out) in five layers on 2026-11-09 showed what the plain failures could not: checkout's idempotency holds (a replay with the same key returns the order the lost write stored) and a lost catalog reservation is given back, but a lost payment authorization is repeated by the retry, and a lost notification is sent twice (register 171). **Lesson.** Any call to something outside the process can succeed without the caller knowing; every retry of it must be idempotent, and the only way to see whether it is is to make it happen. *Status: validated, one project.*

## L-35 Read what each environment's configuration really says before writing a gate on its name

**Situation.** The first design of the chaos gate was an allow-list on the host environment name ("Development" and the dev deployment). The deployed dev stack's Terraform set `ASPNETCORE_ENVIRONMENT=Production`, so the allow-list could never have permitted dev. Changing dev to Development then brought side effects that the name hides: `appsettings.Development.json` turns on the Cosmos emulator's gateway mode, and the services relax their https checks for token metadata. The mock issuer had to stay Production, because that is what makes it enforce its own deployment guards. **Lesson.** Before a rule depends on an environment's name, read what each environment's configuration sets, and list what the name switches on elsewhere. **What changed.** A per-environment `host_environment` variable, the emulator setting pinned, https-only issuer addresses, and a separate `Deployment__Environment` setting that names the environment. *Status: observation.*

## L-36 Two languages stay in step through shared data checked by both, not through two copies kept by hand

**Situation.** The chaos libraries exist in C# and in TypeScript and must make the same decision for the same operation. They share `chaos/test-vectors.json` (expected numbers computed by a third, independent implementation, in Python) and `chaos/layers.json` (the layers and settings); each language's tests check against the files. The TypeScript library matched the vectors at the first run, including a 64-bit seed that a plain `JSON.parse` would have corrupted. **Lesson.** When behaviour must be identical in two places, keep the expected values in one file that neither implementation owns, and make both suites read it. *Status: adopted for the chaos scenarios.*
