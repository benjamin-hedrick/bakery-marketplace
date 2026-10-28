# Portfolio coordination worklog (copy — scoped to this repo's view)

**Source:** Portfolio worklog, reconciled, 2026-09-28 (zip copy).
**Scope:** Cross-repo items: portfolio strategy (P0), cross-repo integration (X-001–004), evidence (EVID-001–004), continuity (CONT-001–005), V2 stream (V2-001–010), gap analysis, sequencing, revisit queue and decision log. Identical copy is placed in all three repos; each copy is also the coordination record for the other two.
**Why duplicated:** Cross-repo decisions and adjustments are recorded in every affected repo so no repo depends on another to know what was decided. When a cross-repo decision changes, update all three copies in the same pass and note it in each repo's index.
**Authority:** The coordination layer is not authoritative for any repo's architecture or process. Repo-level artifacts are.


# Portfolio Worklog --- Cross-Repo Open Items & Improvement Backlog

**Status:** Working document\
**Scope:** Portfolio-level tracking across the three WIP repositories\
**Repos:** `bakery-marketplace`, `project-process-framework`,
`ai-collaboration-playbook`\
**Purpose:** Track decisions, strategy/design questions, missing or
incomplete artifacts, suggested improvements, experiments, and deferred
work without modifying the three WIP repositories until their current
uncommitted work is merged/reconciled.

> This is intentionally a separate tracking artifact. Items may
> eventually be promoted into one of the three repositories, converted
> into backlog issues, resolved by a decision/ADR, or deliberately
> closed as unnecessary. The worklog is not itself authoritative for the
> product architecture; it is the coordination layer for the portfolio.

## Working principles

1.  Preserve the deliberate separation of concerns among the three
    repositories.
2.  Do not optimize for theoretical completeness at the expense of
    working software.
3.  Do not invent process merely to fill an artifact checklist; use
    established patterns where they are known, validate them against
    real work, and record deviations deliberately.
4.  Prefer finding known gaps early when the cost of doing so is low,
    because early clarification has already demonstrated
    rework-prevention value.
5.  Use the bakery project as the reference implementation and empirical
    test bed for the process and AI collaboration repositories.
6.  Capture evidence, not merely claims: experiment -\> result -\>
    learning -\> artifact/process update.
7.  Keep portfolio constraints explicit: intentionally limited scale,
    Azure/free-tier-first economics, local-first development, and a
    deliberately bounded product scope.
8.  Treat AI as a collaborator/agent whose output requires context,
    scope, verification, governance, and human judgment.
9.  Maintain an explicit trail of what is MVP, MVP-lite, Deferred,
    Post-launch, Proposed, Accepted, or intentionally Not Applicable.
10. Revisit this log periodically and close stale items rather than
    allowing it to become an uncontrolled second backlog.

------------------------------------------------------------------------

# Cross-Repo Portfolio Strategy

## P0 --- Establish the portfolio as one coherent demonstration

**Status:** Proposed\
**Owner:** Portfolio / Manager-Lead hat\
**Repos:** All three

Present the three repositories as one integrated portfolio:

``` text
                    SOFTWARE DELIVERY SYSTEM
                              |
             +----------------+----------------+
             |                |                |
       PROCESS FRAMEWORK   AI PLAYBOOK    PRODUCT SYSTEM
             |                |                |
        How we build      How we work     What we build
             |                |                |
             +----------------+----------------+
                              |
                    BAKERY MARKETPLACE
                              |
        +-------------+-------+--------+-------------+
        |             |       |        |             |
      Product      Architecture Build   Operate      Learn
```

**Suggested portfolio narrative**

-   `project-process-framework` --- how a project is framed, governed,
    planned, delivered, operated, and improved.
-   `ai-collaboration-playbook` --- how humans and AI collaborate
    efficiently, safely, and with controlled context.
-   `bakery-marketplace` --- the reference implementation proving the
    approaches against a real software product.

**Why revisit:** This was the original intent and makes the collection
much stronger than three unrelated repositories. It also gives the
portfolio a leadership story rather than only a coding story.

------------------------------------------------------------------------

# 1. Bakery Marketplace --- Strategy, Constraints, and Architecture

# 2. Bakery Marketplace --- Local-First Implementation and Evidence

# 3. Process Framework --- Operating Model

# 4. Process Framework --- Artifact Completeness

# 5. AI Collaboration Playbook --- Human + AI + Agent Operating Model

# 6. Evidence and Portfolio Demonstration

## EVID-001 --- Build an evidence catalog

**Status:** Proposed\
**Priority:** P0

For each major portfolio capability, capture one or more demonstrations:

  Capability              Evidence
  ----------------------- --------------------------------------
  Architecture judgment   ADR + alternatives + consequences
  Local-first DevEx       reproducible local environment
  Resilience              chaos scenario + observed behavior
  CI/CD                   pipeline execution
  Security                threat/model/test evidence
  AI collaboration        bounded work item + context + review
  Process improvement     before/after process change
  Governance              architecture review / permit
  Operations              runbook + drill
  Incident learning       postmortem/game day
  Cost awareness          cost model / measured usage
  Product thinking        MVP prioritization + outcome

**Why revisit:** This turns the portfolio from a collection of documents
into demonstrable engineering evidence.

------------------------------------------------------------------------

## EVID-002 --- Capture "surprise -\> learning -\> change" events

**Status:** Proposed\
**Priority:** P0/P1

Whenever an unexpected issue appears:

``` text
Surprise
  -> Why wasn't this known?
  -> Which artifact/process/context was missing?
  -> Immediate correction
  -> Process/artifact improvement
  -> Verify improvement
```

This is already a validated process pattern in the current work.

------------------------------------------------------------------------

## EVID-003 --- Capture intentional tradeoffs

**Status:** Proposed\
**Priority:** P1

Maintain examples of:

-   what was deliberately not built
-   why
-   what risk was accepted
-   what seam was preserved
-   what would trigger revisiting the decision

This should be visible throughout the portfolio.

------------------------------------------------------------------------

## EVID-004 --- Portfolio case-study narrative

**Status:** Proposed\
**Priority:** P1

Eventually create a concise case study showing:

1.  Problem selection
2.  Constraints
3.  Product strategy
4.  Architecture
5.  Process
6.  AI collaboration
7.  Implementation
8.  Testing
9.  Chaos/resilience
10. Deployment
11. Operations
12. Learning/refinement

**Why revisit:** This is the eventual "front door" for readers of the repository.

------------------------------------------------------------------------

# 7. Standard Engineering Practices --- Completeness Sweep

# 8. Cross-Repo Integration

## X-001 --- Define authoritative ownership across repositories

**Status:** Proposed\
**Priority:** P0

Establish:

  ---------------------------------------------------------------------
  Concern                            Authority
  ---------------------------------- ----------------------------------
  Generic project process            Process Framework

  Software-specific process patterns Process Framework

  Project-specific architecture      Bakery

  Project-specific product decisions Bakery

  AI collaboration method            AI Playbook

  AI-specific project implementation Bakery + AI Playbook case study
  evidence                           

  Portfolio evidence                 Eventually separate portfolio
                                     layer or curated case study
  ---------------------------------------------------------------------

**Why revisit:** Prevents the three repos from duplicating or
contradicting one another.

------------------------------------------------------------------------

## X-002 --- Cross-repo version/reference strategy

**Status:** Proposed\
**Priority:** P1

Decide how the bakery project references the process framework:

-   version/tag
-   commit SHA
-   copied snapshot
-   submodule
-   plain external reference
-   case-study version

Prefer a lightweight approach suitable for a portfolio.

------------------------------------------------------------------------

## X-003 --- Process promotion loop

**Status:** Partially implemented; formalize later

Use:

``` text
Idea / surprise
    -> Discovery
    -> Try against real work
    -> Review
    -> Generalize
    -> Promote to framework
    -> Reference from project
```

This already exists informally and is now explicitly represented in the
Process Framework.

------------------------------------------------------------------------

## X-004 --- AI/process feedback loop

**Status:** Proposed

Use:

``` text
Process requirement
      ->
AI collaboration experiment
      ->
Observed friction/surprise
      ->
AI Playbook improvement
      ->
Process Framework improvement
      ->
Better Bakery execution
```

This becomes one of the strongest demonstrations of the portfolio.

------------------------------------------------------------------------

# 9. Existing Project Items Worth Folding Into This Worklog

The Bakery repo already contains an Open Items Register. These should
remain project-level until resolved, but are important inputs to the
cross-repo log:

-   Redis authentication/tier decision
-   Cosmos emulator limitations
-   Cosmos shared throughput/noisy-neighbor risk
-   Cosmos security blast radius
-   Cosmos partition-key validation
-   payment chargebacks/disputes
-   single-region/single-currency assumption
-   centralized authorization policy question
-   secret rotation
-   local Compose implementation
-   reusable tooling packages
-   GitHub Projects board
-   docs-site publishing
-   CI implementation
-   ephemeral environments
-   delivery/dispatch deferral
-   advertising deferral
-   explicit B2B scope exclusion

These are not duplicated as a second project backlog here; this log
records the cross-repo implications and items that may affect the
broader portfolio.

------------------------------------------------------------------------

# 10. Cross-Repo Gap Analysis --- Initial Findings

## Strong / intentionally established

### Strategy and architecture

-   Deliberate product selection.
-   Explicit actor/value-stream complexity.
-   Clear MVP/deferred posture.
-   Strong architecture decision discipline.
-   Explicit alternatives and consequences.
-   Bounded contexts and domain language.
-   Event-driven architecture.
-   Explicit service/deployment mapping.
-   Local fallback pattern.
-   Cost-conscious cloud architecture.
-   Security principles.
-   Explicit sensitive-data concern.
-   Extensibility seams.
-   Buy-vs-build reasoning.
-   Modular-monolith reasoning.

### Process

-   Domain-agnostic core.
-   Hats/roles.
-   Scope exploration in rounds.
-   Discovery vs committed framework.
-   Context completeness.
-   Surprise-as-trigger.
-   Artifact inventory.
-   Work-item structure before backlog detail.
-   Outline before detail.
-   Reusable decision-record discipline.
-   Methodology separation.
-   Domain specialization concept.

### AI collaboration

-   Intent recognition.
-   Narrow exchanges.
-   Efficient context sharing.
-   Curated context packets.
-   Explicit assumptions/gaps.
-   Tradeoff questioning.
-   Consistency audits.
-   Brainstorming in rounds.
-   Open-item capture.
-   Discovery/promotion.
-   Case studies.

### Portfolio

-   Clear reference implementation.
-   Strong role coverage.
-   Deliberate technology constraints.
-   Clear opportunity to demonstrate local-first engineering.
-   Strong future chaos/resilience story.

------------------------------------------------------------------------

## Partially established / needs completion

-   NFRs.
-   Definition of Ready.
-   Definition of Done.
-   Architecture review.
-   Change management.
-   Governance.
-   Operations.
-   Runbooks.
-   Postmortem/game-day model.
-   CI/CD.
-   Local environment.
-   Shared tooling.
-   Observability.
-   Ephemeral environments.
-   Privacy.
-   Disaster recovery.
-   Rate limiting.
-   Feature flags.
-   Security automation.
-   Cost governance.
-   Stakeholder governance.
-   Project financial model.
-   Hypothetical staffing/capacity.
-   Public project board.
-   Published docs.
-   Portfolio evidence.

------------------------------------------------------------------------

## Not yet validated by actual execution

-   Full Phase 8 process.
-   Build -\> launch -\> operate -\> learn.
-   Real CI/CD execution.
-   Real local walking skeleton.
-   Real chaos testing.
-   Real operational drills.
-   Real incident/postmortem loop.
-   Multi-agent execution.
-   Agent handoffs.
-   Agent conflict resolution.
-   Agent permissions.
-   Large-scale context retrieval.
-   Process changes discovered during implementation.
-   Cloud deployment.
-   Cost measurement against actual usage.
-   Performance/load evidence.
-   Recovery/restore evidence.

------------------------------------------------------------------------

# 11. Highest-Value Next Work Sequence

This is a proposed sequence, not a commitment.

## Phase A --- Reconcile before coding

1.  Merge/review the user's newer uncommitted WIP.
2.  Make the portfolio constraints explicit.
3.  Resolve/reassess Azure AD B2C -\> Entra External ID.
4.  Run architecture consistency audit.
5.  Run standard-practice completeness sweep.
6.  Resolve only high-confidence, high-rework-risk gaps.

## Phase B --- Establish the local execution foundation

1.  Local Compose/dev environment.
2.  Seed data.
3.  Minimal web/API path.
4.  Local persistence.
5.  Local event backbone.
6.  Local cache.
7.  Basic observability.
8.  CI skeleton.
9.  First vertical slice.

## Phase C --- Turn resilience into evidence

1.  Introduce adapters/fallbacks.
2.  Add contract tests.
3.  Add chaos harness.
4.  Run failure scenarios.
5.  Capture evidence.
6.  Update NFRs/runbooks/process as needed.

## Phase D --- Use real work to evolve the frameworks

1.  Feed implementation surprises into the Process Framework.
2.  Test work-item context packets.
3.  Try one AI-assisted bounded implementation.
4.  Measure/review the collaboration.
5.  Update the AI Playbook.
6.  Promote validated process changes through Discovery.

## Phase E --- Agent experiment

1.  Select one suitable agent.
2.  Give it one tightly bounded work item.
3.  Establish context packet.
4.  Establish permissions.
5.  Require tests/evidence.
6.  Review independently.
7.  Capture handoff/review lessons.
8.  Try a second agent or role only after the first experiment is
    understood.

## Phase F --- Portfolio evidence

Build the case study around:

**Intent -\> Constraints -\> Decisions -\> Process -\> AI Collaboration
-\> Implementation -\> Failure -\> Recovery -\> Learning**

------------------------------------------------------------------------

# 12. Revisit Queue

These are ideas worth explicitly retaining even if they are not
immediate work:

-   Entra External ID decision.
-   Architecture Review Board.
-   Permit to Build / Permit to Operate.
-   Definition of Ready deep dive.
-   Definition of Done deep dive.
-   Lifecycle gates.
-   Decision authority.
-   Escalation.
-   Change management.
-   Governance exceptions.
-   Artifact dependency graph.
-   Artifact freshness model.
-   Agent role model.
-   Agent handoff contracts.
-   Agent permissions.
-   Context packet specification.
-   Retrieval vs curated context.
-   AI artifact stewardship.
-   AI audit trail.
-   AI effectiveness measures.
-   Local-first infrastructure.
-   Chaos/game-day evidence.
-   Ephemeral environments.
-   Supply-chain security.
-   Secure SDLC.
-   Data lifecycle/privacy.
-   Backup/restore and DR.
-   Cost governance.
-   Stakeholder/communications model.
-   Capacity/resource planning.
-   Portfolio evidence catalog.
-   Cross-repo authority/versioning.
-   Process-to-AI-to-product feedback loop.
-   Standard engineering-pattern completeness review.

------------------------------------------------------------------------

# 13. Decision Log for This Review

### Accepted direction

-   Treat all three repositories as one portfolio.
-   Maintain this separate worklog.
-   Do not directly modify the three WIP repositories during this phase.
-   Use the bakery marketplace as the empirical reference
    implementation.
-   Continue planning/design before implementation where it prevents
    known rework.
-   Move into implementation deliberately rather than waiting for
    theoretical completeness.
-   Start with 100% local infrastructure/mocks and controlled chaos
    where practical.
-   Use established engineering practices as the completeness baseline
    rather than inventing new patterns unnecessarily.
-   Capture evidence as part of the implementation process.

### Explicitly not decided yet

-   Final customer identity provider.
-   Exact architecture review/governance mechanics.
-   Exact lifecycle gate structure.
-   Exact multi-agent topology.
-   Agent tooling/vendor selection.
-   RAG vs curated context at scale.
-   Final portfolio presentation format.
-   Which deferred capabilities will eventually be implemented.

------------------------------------------------------------------------

# 14. Working Status Legend

-   **P0** --- high-value / should resolve before dependent work.
-   **P1** --- important; should be addressed during the next major
    refinement.
-   **P2** --- useful enhancement; can wait.
-   **Proposed** --- suggested, not accepted.
-   **Open** --- requires investigation/decision.
-   **Planned** --- direction accepted, implementation pending.
-   **Partially addressed** --- some implementation exists; needs
    completion or validation.
-   **Deferred** --- intentionally postponed with rationale.
-   **Validated** --- demonstrated against real work.
-   **Closed** --- no further action required.

------------------------------------------------------------------------

## Review note

This worklog intentionally records both **known gaps** and **possible
improvements**. It should not be interpreted as saying every item must
be implemented. The purpose is to make the decision visible so that the
project can explicitly choose:

> implement / document / defer / reject / not applicable

That distinction is itself part of the portfolio's demonstration of
engineering judgment.

# 15. Portfolio Continuity / Capture Reconciliation

## CONT-001 --- Portfolio continuity and capture protocol

**Status:** Proposed --- newly identified during continuity audit\
**Priority:** P0

Ensure that material decisions, suggestions, open questions, risks,
surprises, process improvements, experiments, and follow-up work survive
context-window rollover, topic changes, new conversations, tool/AI-agent
changes, repository changes, and handoffs.

Every material discovery should receive a durable identity and
disposition before a work session is considered safely complete.

At minimum capture: durable ID, source/session, category, status,
priority, owner/role, target authoritative artifact/repository,
dependencies, evidence needed, related IDs, and next action or explicit
disposition.

### Continuity levels

1.  Work-item continuity --- context required for one bounded item.
2.  Session continuity --- material unresolved discussion that must
    survive a topic/conversation change.
3.  Portfolio continuity --- decisions, questions, risks, improvements,
    experiments, and lessons that survive across repositories, sessions,
    tools, and agents.

### Session closure rule

A session is not complete merely because the requested task is complete.
It is complete when the requested task and all material discoveries
generated during it have been captured/routed, resolved/recorded,
deliberately deferred, rejected, marked not applicable, or otherwise
dispositioned.

### Suggestion versus decision

A captured suggestion is not an architectural or process decision merely
because it is written into the Worklog.

``` text
Suggestion / observation
        ->
Capture
        ->
Analysis / experiment
        ->
Human decision where consequential
        ->
Authoritative artifact
```

The Worklog preserves continuity; authoritative artifacts preserve
decisions.

### Reconciliation

At meaningful session boundaries:

``` text
Discussion / work
      ->
Identify material discoveries
      ->
Assign durable IDs
      ->
Route to owner / artifact
      ->
Reconcile cross-references
      ->
Close or explicitly disposition
```

Reconciliation is a recovery/control mechanism and does not replace
capture-as-you-go discipline.

### AI/agent rule

AI and agents should not leave material discoveries only in
conversational output. New decisions, risks, contradictions,
assumptions, improvements, surprises, or unresolved questions must be
captured or routed according to the continuity protocol.

### Recovery

If an item was discussed but not captured, record it immediately, mark
it as recovered, identify the missing context/artifact, assess whether
prior decisions may have been affected, synchronize affected artifacts,
and record a lesson when the omission reveals a process weakness.

## CONT-002 --- Durable item identity and routing model

**Status:** Proposed\
**Priority:** P0

Material portfolio items should have stable IDs and an explicit
destination.

Suggested fields:

  -----------------------------------------------------------------------
  Field                               Purpose
  ----------------------------------- -----------------------------------
  ID                                  Durable identity across sessions

  Source                              Where the item originated

  Type                                Decision, question, risk,
                                      suggestion, improvement, evidence,
                                      etc.

  Status                              Proposed, Open, Accepted, Deferred,
                                      Rejected, Implemented, Superseded,
                                      etc.

  Target                              Authoritative repository/artifact

  Evidence                            What must be learned before
                                      disposition

  Related IDs                         Cross-references

  Last reviewed                       Prevent silent aging
  -----------------------------------------------------------------------

The Worklog acts as the durable coordination ledger until an item
reaches its authoritative destination.

## CONT-003 --- Portfolio continuity reconciliation audit

**Status:** Planned\
**Priority:** P0

Periodically ask:

> Can every material suggestion, decision, open question, risk,
> surprise, improvement, and follow-up be located in a durable artifact
> with a status and eventual owner?

Audit the Worklog, Governance exploration, Lessons Learned, Process
Framework, AI Collaboration Playbook, Bakery project register/decision
artifacts, and current session discoveries.

## CONT-004 --- Continuity evidence

**Status:** Proposed\
**Priority:** P1

When the continuity protocol is exercised, preserve evidence showing
material discovery, capture timing, durable ID assignment, routing,
handoff, reconciliation, artifact synchronization, recovered omissions,
and resulting process improvement.

# 16. Artifact Landscape / Tailoring Exploration

This section captures a newly identified portfolio-level direction. It is
exploratory and does not yet establish a canonical artifact set or require
changes to the three WIP repositories.

The framework is intended to be broad and reusable across projects and
organizations. Not every framework capability or artifact applies to every
project, and organizations may use different names, document boundaries,
methodologies, workflows, and approval mechanisms for substantially similar
purposes.

The working approach is therefore to distinguish **capability / information /
decision / evidence** from the **artifact used to represent it**.

The initial artifact exploration set includes:

- Business Case
- Lightweight Business Case
- Business Requirements Document (BRD)
- System / Solution / Software Requirements documents
- Design Document

Additional artifacts will be added as they are discovered through public
reference research, prior experience, and actual portfolio work.

## Initial exploration sequence

1. Establish public-reference landscape.
2. Analyze the initial five artifact families.
3. Build capability/information/artifact relationships.
4. Identify overlap and terminology differences.
5. Define applicability/tailoring principles.
6. Define variants and substitution rules.
7. Test the model against the Bakery project.
8. Compare against any historical materials when they become available.
9. Decide whether an artifact-library repository is warranted.
10. Promote only validated concepts into the Process Framework and AI
    Collaboration Playbook.

## Explicit non-decisions

The following are intentionally **not** decided yet:

- that every project needs every artifact
- that BRD, SRS, system requirements, solution requirements, and software
  requirements are necessarily distinct artifacts
- that a particular methodology is the framework's preferred methodology
- that a separate artifact-library repository must be created
- that the Process Framework should prescribe a universal document sequence
- that public templates are authoritative

---

# 16. Exploration execution discipline --- Minimum Sufficient Context

# 17. V2 Working Stream --- Repository Organization and Experimental Baseline

## V2-001 --- Establish a deliberate V2 parallel working stream

**Status:** Accepted for V2 planning\
**Priority:** P0

V2 is a deliberate parallel working stream, not a cleanup or direct rewrite of
V1. It should draw from V1's established/planned material, incorporate useful
new ideas, and test the resulting process through a fresh implementation.

The V2 stream will:

- preserve the core Bakery business ideas and vision while starting the
  implementation fresh
- use a new technology stack
- apply the emerging process and artifact model from the beginning
- generate project/process artifacts from scratch rather than copying the V1
  artifact set wholesale
- allow V1 and V2 to evolve independently while V1 work remains active
- provide a basis for a later comparison and reconciliation/consolidation pass

**Guardrail:** Do not automatically import every V1 idea. For each candidate,
classify it as established/validated, a hypothesis worth testing, or merely an
interesting possibility before making it part of the V2 operating model.

## V2-002 --- Use two repositories for the V2 exploration stream

**Status:** Accepted\
**Priority:** P0

For the V2 exploration, use two repositories:

1. **Bakery Marketplace V2** — intentionally minimal at the start, preserving
   only the main business ideas/vision needed to begin the new project.
2. **Portfolio Working / Everything Else** — contains the V2 process framework,
   AI collaboration material, artifact exploration, working artifacts,
   continuity records, hypotheses, work tracking, research notes, and other
   supporting material.

This is an intentional exploration-time organization choice, not a claim that
all reusable material should permanently live in one repository.

**Rationale:** Current upload, file, and link limits make additional repository
boundaries operationally expensive. The portfolio already has other mechanisms
for controlling processing scope—templates, tagging, explicit task scope,
minimum-sufficient context, exclusions, "you do not need to know" guidance,
durable IDs, and work tracking. During exploration, those controls provide
more value than prematurely optimizing repository structure for lean reuse.

**Guardrail:** Revisit repository boundaries only when actual scale, lifecycle,
ownership, discoverability, or collaboration needs demonstrate a concrete
benefit from further separation.

## V2-003 --- Create a V2 baseline and hypothesis register

**Status:** Planned\
**Priority:** P0

Before substantial V2 execution, establish a lightweight register separating
what V2 is adopting from what it is intentionally testing.

Candidate hypotheses include:

- **H-001:** Minimum-sufficient context reduces unnecessary processing and
  assumption risk without reducing correctness when task boundaries are clear.
- **H-002:** Artifact selection should be capability/information/decision-driven
  rather than document-name-driven.
- **H-003:** Proportional governance can reduce unnecessary process overhead while
  preserving meaningful control.
- **H-004:** An explicit **Architecture Approved** state improves clarity between
  architectural approval and implementation readiness.
- **H-005:** Durable IDs and routing improve continuity across parallel human/AI
  collaboration.
- **H-006:** Artifact substitution/equivalence can preserve required information
  while allowing different organizations to package it differently.

Hypotheses should ultimately be classified during reconciliation as:
**Confirmed, Refuted, Partially Supported, Not Tested**, or another explicitly
agreed disposition.

## V2-004 --- Preserve provenance across the V2 exploration stream

**Status:** Planned\
**Priority:** P1

V2 work should distinguish the provenance of significant concepts and findings,
including:

- external reference
- observed practice
- V1 lesson
- user experience
- portfolio interpretation
- V2 decision
- V2 implementation evidence

This allows V2 to use V1 intelligently without making V1 authoritative by
default and supports the later reconciliation/consolidation pass.

## V2-005 --- Treat V2 reconciliation as a planned learning stage

**Status:** Planned\
**Priority:** P0

After meaningful V2 process and Bakery implementation work exists, compare V1
and V2 rather than selecting one as automatically correct.

The reconciliation should examine:

- what each stream established
- what each stream discovered
- where process/artifact choices differed
- what worked or created friction
- which differences are intentional tailoring versus competing models
- which hypotheses gained or lost support
- what should be retained, changed, combined, or rejected

Only after this comparison should broadly reusable concepts be promoted into a
consolidated framework.

---

# 18. Immediate V2 Starting Sequence

The initial V2 sequence is intentionally small and reversible:

1. **Define the two-repository boundary and ownership model.**
2. **Create the V2 baseline/hypothesis register** and identify which V1 concepts
   are established inputs versus experiments.
3. **Preserve the Bakery V2 business baseline** — vision, major user/business
   capabilities, and intentional scope — without carrying forward V1
   implementation decisions unless explicitly selected.
4. **Establish the V2 working structure** in the Everything Else repository,
   including process, AI collaboration, artifact exploration, continuity, and
   work tracking areas.
5. **Run the first bounded artifact exploration tasks**, beginning with the
   highest-value requirements/business/architecture artifact questions already
   identified in ART-009 and ART-010.
6. **Use those findings to design the V2 project/process artifacts from
   scratch**, rather than copying V1 templates.
7. **Start Bakery V2 planning and architecture** using the V2 process, with
   implementation deliberately following the resulting decisions rather than
   preloading V1's technology choices.
8. **Capture evidence and surprises as V2 proceeds**, then periodically
   reconcile them into the working log and authoritative artifacts.

**Important sequencing rule:** Artifact exploration and V2 project execution
can proceed in parallel where useful, but a research task should remain bounded;
additional validation against Bakery or the broader portfolio becomes an
explicit task when it is not part of the original exploration objective.

# 19. V2 Execution-First Clarifications and Collaboration Model

## V2-006 --- Reframe V2 around execution demonstration

**Status:** Accepted direction
**Priority:** P0

The primary purpose of V2 is to demonstrate disciplined professional software
project execution and delivery, not to produce a theoretically complete,
perfectly reusable Process Framework.

The Bakery project is the empirical vehicle. The work should demonstrate,
where appropriate:

- project framing and objectives;
- business/product understanding;
- stakeholders and users;
- requirements and scope;
- architecture and technical decision-making;
- planning and prioritization;
- change/scope control;
- risks, issues, dependencies, and escalation;
- development and engineering practices;
- testing and verification;
- release/delivery;
- operations/support;
- evidence and response to problems;
- learning and improvement.

The Process Framework should contain enough structure and artifacts to make
that execution visible and credible. Reusability remains valuable, but it is
secondary to successful execution and demonstration in this iteration.

**Explicit non-goal:** Do not delay meaningful V2 execution while attempting
to perfect a universal reusable framework or artifact catalog.

---

## V2-007 --- Treat professional experience as provenance, not methodology authority

**Status:** Accepted direction
**Priority:** P1

User professional experience and observed organizational practice should be
captured as a distinct provenance category alongside external references,
portfolio interpretation, V1 lessons, V2 decisions, and V2 implementation
evidence.

Professional experience is valuable evidence of practices that have been used
in real environments, but it should not automatically be treated as a
universal or current standard. Conversely, unfamiliar methodologies or
artifacts can be explored deliberately without pretending they were part of
that professional experience.

This supports the portfolio goal of demonstrating management, organization,
execution, and delivery while preserving provenance and intellectual honesty.

---

## V2-008 --- Rebuild the V2 priority/work sequence around execution

**Status:** Planned
**Priority:** P0
**Sequence:** Next 6

After the preceding collaboration-model and execution-objective work, review
the existing V2 worklog and reclassify/resequence work around what is required
to execute the Bakery project and demonstrate professional delivery.

Do not physically rearrange the historical worklog merely to achieve a new
ordering. Record the current execution sequence as an explicit planning view
and preserve historical IDs/statuses.

The sequence should distinguish:

- work required before dependent execution;
- work useful for immediate execution;
- experiments that can run in parallel;
- evidence/case-study capture;
- framework generalization that can wait;
- research that is valuable but not execution-blocking.

---

# 20. Immediate V2 Next-Work Sequence

The following six items are the current top of the V2 execution queue. They are
listed as a planning view rather than physically reordered in the historical
Worklog:

1. **Context rendering / delegation model** — ART-020 (P0)
2. **AI/agent handoff + result model** — ART-021 (P0)
3. **V2 execution objective** — V2-006 (P0)
4. **Minimum professional process/artifact set** — PROC-015 (P0)
5. **ART-009 context packet first test** — ART-022 (P0)
6. **Rebuild V2 priority/work sequence** — V2-008 (P0)

These items are deliberately small enough to resolve the collaboration and
execution model before committing to a broad artifact-production sequence.

---

## V2-009 --- Execution delegation as a first-class operating pattern

**Status:** Planned
**Priority:** P0

V2 should be designed to support delegation of bounded units of work to
multiple AIs and future AI agents, not merely collaboration with one persistent
chat.

The operating pattern should therefore treat context rendering, session
identity, durable work-item identity, structured handoff/result contracts,
reconciliation, and human decision authority as first-class concerns.

This is a major reusable portfolio outcome in its own right and should be
validated through actual delegated work before being generalized into the AI
Collaboration Playbook.

## V2-010 --- Delegation rendering model clarified around targeted execution artifacts

**Status:** Accepted direction
**Priority:** P0

The V2 delegation model is now defined as rendering a new, targeted
**Delegation Task** from a durable Work Item. The objective is not to
"selectively copy context" or minimize context. The renderer creates a
self-contained execution artifact containing the context appropriate for the
specific delegated work and intended AI/agent.

Key decisions and lessons:

- The renderer's primary responsibility is to convert a durable Work Item into
a self-contained Delegation Task suitable for a specified AI/agent to execute.
- The renderer does not perform the underlying work, silently make project
decisions, or modify authoritative project artifacts as part of rendering.
- A Delegation Task is a transient execution artifact. It references its
originating Work Item, is created just in time, is delegated and verified, and
is then closed and removed after useful results have been reconciled into the
authoritative project artifacts.
- The originating Work Item should record that a delegation packet/task was
created, using a status such as **Rendered for Delegation** or **Delegation
Packet Created**. The exact status vocabulary remains to be finalized.
- Rendering is intentionally just-in-time so the Delegation Task reflects the
current authoritative project state and reduces stale-context risk.
- Context rendering should be available as a delegable AI capability. A
relatively inexpensive/older/open model can potentially perform the rendering
when it has repository access plus the renderer prompt and guidance.
- The renderer should optimize for **targeted sufficient context**, not
minimum context. Context should be included when it materially improves the
delegate's ability to understand the objective, execute correctly, evaluate
alternatives, or produce the requested result. Context size alone is not a
reason to exclude useful information.
- The delegated AI should not have to rediscover established project reasoning
merely to perform the assigned work.
- The renderer must not invent missing information. Material gaps,
contradictions, or unresolved decisions must be surfaced in the Delegation
Task or cause rendering to pause when the work cannot responsibly proceed.
- Provenance and authority matter: requirements, accepted decisions,
proposals, observations, hypotheses, and other information classes should not
be presented as if they have equivalent authority.
- A Delegation Task may identify whether an input is a direct model, reference,
or analogy for what the delegate is being asked to create. This can be useful
context and should be represented explicitly when applicable.
- Different work may be rendered for different AI capabilities. The same
project can therefore route requirements analysis, architecture review,
security analysis, implementation, testing, or other bounded work to
appropriate models/agents without changing the authoritative project state.

### Collaboration-process lesson

**Established constraints override generic failure-mode speculation.** If the
user has already defined a constraint that rules out a hypothetical failure
mode, do not repeatedly design around that failure mode. Surface genuinely
material risks briefly and keep the discussion focused on the unresolved
design question.

A related lesson is that AI collaboration should favor **specific targeted
work, well-defined objectives, sufficiently rich authoritative context, and
concise structured outputs**. Do not assume that reducing context is inherently
more efficient; for complex engineering/project work, additional relevant
context can improve correctness and reduce unsupported inference.
