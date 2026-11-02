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
| L-10 | A fact written in many places drifts; generate one | Adopted, enforcement open |
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

**Situation.** Status, test counts and ADR counts were retyped in many documents, and most documents read in October were stale somewhere. **Lesson.** One source per kind of fact, generated where possible, with a check. **Evidence.** The October review; the generated `STATUS.md`. **Change.** `scripts/docs/status.mjs`. **Still open.** The check is not enforced anywhere (register 90), so it relies on someone running it. **Status.** Adopted, enforcement open.

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
