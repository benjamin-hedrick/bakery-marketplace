# Worklog extract — bakery-marketplace (repo-specific)

**Source:** Portfolio worklog, reconciled, 2026-09-28 (zip copy).
**Scope:** Items whose subject is the Bakery Marketplace repo: strategy/constraints (BAK-001–007), local-first implementation (BAK-010–014), and engineering-practice completeness (STD-001–005).
**Authority:** Tracking input only. Not an ADR, not a work item. Repo-level agents verify each item against the repo and reconcile it into the appropriate repo artifact. Do not treat any entry as accepted.
**Coordination items** that also affect this repo are in `worklog-coordination.md` (copied into this repo, same date).



# 1. Bakery Marketplace --- Strategy, Constraints, and Architecture

## BAK-001 --- Make portfolio/environment constraints explicit

**Status:** Proposed; latest WIP may already contain some of this\
**Priority:** P0\
**Target:** Bakery docs / vision / tech-stack / NFRs

Explicitly capture as binding or guiding constraints:

-   Portfolio/demo project, not production-scale SaaS.
-   Azure is the target cloud.
-   Free-tier/low-cost-first is an explicit architectural constraint.
-   Local-first development should reproduce meaningful system behavior
    without requiring paid Azure resources.
-   Scale is intentionally bounded and should be honest rather than
    aspirational.
-   Architecture should demonstrate enterprise-quality patterns without
    pretending enterprise-scale infrastructure is required.
-   Cost, complexity, and portfolio demonstration value are first-class
    tradeoff dimensions.

**Why revisit:** The strategy is already clearly present in the work;
making it explicit prevents later ADRs from rediscovering it and gives
reviewers the rationale for deliberately modest infrastructure.

------------------------------------------------------------------------

## BAK-002 --- Reassess customer identity choice: Azure AD B2C

**Status:** Open --- high priority\
**Priority:** P0\
**Target:** Bakery ADR-0006, NFRs, tech stack, auth backlog

Azure AD B2C is a legacy choice for a new project. Microsoft now
recommends Microsoft Entra External ID for new customer-facing ASP.NET
Core applications; Azure AD B2C is no longer available for purchase by
new customers as of May 1, 2025. Existing B2C customers can continue
using it, but that is not the relevant posture for a new portfolio
deployment.

**Primary replacement to investigate:** Microsoft Entra External ID for
customers.

**Alternatives worth evaluating briefly:**

-   Microsoft Entra External ID --- strongest Azure-native replacement
    and best alignment with the project's Azure strategy.
-   Auth0 --- credible CIAM alternative, but introduces a non-Azure
    vendor and a separate platform/cost model.
-   Clerk --- developer-friendly alternative, but less aligned with
    demonstrating Azure-native enterprise architecture.
-   Keycloak --- excellent open-source/local option, but adds
    operational complexity and weakens the simplicity of the Azure
    target.

**Recommended direction:** Start with Microsoft Entra External ID as the
leading candidate, then perform a small decision comparison around
free-tier economics, local development, OAuth/OIDC support, social/local
identity options, claims, authorization integration, and operational
complexity.

**Why revisit:** This is exactly the type of early architecture
correction the process is intended to surface before implementation.
Microsoft identifies External ID as its current CIAM platform and says
the core offer is free for the first 50,000 MAU; verify current
pricing/features again immediately before implementation.
citeturn0search0turn0search5

------------------------------------------------------------------------

## BAK-003 --- Capture technology-selection principles as reusable decision criteria

**Status:** Proposed\
**Priority:** P1\
**Target:** Bakery tech-stack / vision / process framework

Explicitly record the principles already driving selections:

-   Free-tier/low-cost-first.
-   Azure-native where it provides meaningful portfolio value.
-   Local equivalent where practical.
-   Buy rather than build for capabilities with high
    compliance/security/operational burden.
-   Design extension seams for intentionally deferred capabilities.
-   Avoid infrastructure complexity that doesn't produce portfolio
    value.
-   Prefer identity-based access over long-lived secrets.
-   Prefer logical isolation even when physical deployment is
    consolidated.
-   Prefer independently testable contracts/interfaces.
-   Demonstrate resilience through controlled failure, not architecture
    diagrams alone.

**Why revisit:** These principles are already driving many ADRs. Making
them first-class will reduce repeated justification and make the
portfolio's engineering judgment easier to understand.

------------------------------------------------------------------------

## BAK-004 --- Identify other high-value architectural constraints before implementation

**Status:** Proposed\
**Priority:** P1

Run a deliberate constraint sweep for:

-   Security posture / zero trust.
-   Data sensitivity and retention.
-   Availability/SLO expectations.
-   Recovery objectives (RTO/RPO).
-   Abuse/rate limiting.
-   Observability.
-   Deployment frequency / rollback expectations.
-   Environment isolation.
-   Developer experience.
-   Testability.
-   Cost ceilings.
-   Accessibility.
-   Privacy/legal obligations.
-   Dependency/vendor outage behavior.
-   Data lifecycle and deletion.

**Why revisit:** The project already caught missing security assumptions
through the "surprise as a trigger" process. The goal is not exhaustive
bureaucracy; it is a low-cost early check for established concerns that
would otherwise force rework.

------------------------------------------------------------------------

## BAK-005 --- Reconcile architecture ahead of implementation

**Status:** Proposed\
**Priority:** P0

Before implementation accelerates, perform a cross-document consistency
audit covering:

-   bounded contexts
-   service/deployment mapping
-   event backbone
-   data stores
-   API gateway
-   identity/auth
-   secrets
-   cache
-   local environment
-   NFRs
-   cost assumptions
-   environment topology
-   deployment model

**Why revisit:** The project already demonstrated that shared reference
documents become stale quickly after ADRs. Repeat that lesson before the
walking skeleton.

------------------------------------------------------------------------

## BAK-006 --- Decide where modular monolith vs. separate service boundaries apply

**Status:** Partially addressed; continue\
**Priority:** P1

Use the existing pattern deliberately:

> Logical bounded-context boundaries remain intact even when multiple
> contexts share one deployable service.

Document which contexts are physically separated and which are
co-located, and why.

**Why revisit:** This is one of the strongest portfolio-level
demonstrations of judgment: intentionally choosing less infrastructure
while preserving future extraction seams.

------------------------------------------------------------------------

## BAK-007 --- Validate the known architecture patterns against standard practice

**Status:** Proposed\
**Priority:** P1

Review the current patterns against established software engineering
practices rather than inventing replacements.

Candidate areas:

-   ports/adapters / hexagonal architecture
-   dependency inversion
-   contract testing
-   consumer-driven contracts where appropriate
-   idempotency
-   outbox/inbox patterns
-   retry/backoff/circuit breaker
-   bulkhead/isolation
-   timeout/deadline propagation
-   correlation/trace IDs
-   structured logging
-   health/readiness/liveness checks
-   graceful shutdown
-   schema/version compatibility
-   backward-compatible API evolution
-   database migration strategy
-   feature flags
-   rate limiting
-   secure secret handling
-   least privilege
-   threat modeling
-   SBOM/dependency scanning
-   SAST/DAST where proportionate
-   accessibility testing
-   test pyramid / testing strategy
-   deterministic test data
-   reproducible builds
-   immutable artifacts
-   rollback strategy
-   backup/restore verification
-   RTO/RPO
-   disaster recovery/game-day testing

**Rule:** Only add patterns that materially improve the project or
demonstrate a useful capability. Do not turn the repo into a catalog of
every industry buzzword.

**Why revisit:** The user correctly identified that many "missing" areas
are not inventions; there are well-established patterns to draw from.
The opportunity is to perform a deliberate completeness pass now while
the cost of incorporating known practices is low.

------------------------------------------------------------------------


# 2. Bakery Marketplace --- Local-First Implementation and Evidence

## BAK-010 --- Build a 100% local walking skeleton first

**Status:** Planned\
**Priority:** P0

Start with local infrastructure and mocks:

``` text
Web
  -> API
     -> Catalog / Ordering
        -> Local data store
        -> Local event transport
        -> Local cache
        -> Notification consumer
        -> Queue display
```

Keep the interfaces aligned with the intended Azure implementations.

**Why revisit:** This is both a portfolio differentiator and a practical
developer-experience win. It lets the project demonstrate meaningful
software behavior before cloud spend or external dependencies enter the
loop.

------------------------------------------------------------------------

## BAK-011 --- Build reusable local infrastructure and developer tooling

**Status:** Proposed\
**Priority:** P0/P1

Implement or document:

-   containerized local services
-   seed/fixture data
-   repeatable reset
-   service startup orchestration
-   environment configuration
-   local observability
-   test data generation
-   event inspection
-   fault injection
-   one-command or minimal-command setup
-   developer troubleshooting guide

**Why revisit:** Directly supports Developer Experience, reusable
tooling, ephemeral environments, and engineering-management themes.

------------------------------------------------------------------------

## BAK-012 --- Make chaos/fault injection a visible portfolio capability

**Status:** Planned\
**Priority:** P1

Create controlled scenarios for:

-   cache outage
-   event delay
-   duplicate events
-   out-of-order events
-   dependency timeout
-   dependency error
-   transient database failure
-   notification failure
-   service restart
-   malformed/unsupported event version where appropriate

Capture:

1.  failure injected
2.  expected behavior
3.  observed behavior
4.  evidence
5.  defect or improvement found
6.  resulting artifact/process update

**Why revisit:** This converts "resilience" from a claim into evidence
and creates excellent material for portfolio walkthroughs.

------------------------------------------------------------------------

## BAK-013 --- Establish a repeatable evidence format

**Status:** Proposed\
**Priority:** P1

For meaningful experiments, capture:

-   Scenario
-   Initial hypothesis
-   Preconditions
-   Action
-   Expected result
-   Actual result
-   Measurements/evidence
-   Defects or surprises
-   Decision/change
-   Artifact(s) updated
-   Follow-up work

**Why revisit:** This is the bridge from implementation to portfolio
storytelling.

------------------------------------------------------------------------

## BAK-014 --- Demonstrate ephemeral/preview environments

**Status:** Open in current project register\
**Priority:** P1

Explore a deliberately small ephemeral environment pattern. It can be
local or cloud-based depending on cost.

Demonstrate:

-   isolated configuration
-   seeded data
-   automated creation
-   automated teardown
-   reproducibility
-   safe test data
-   branch/PR association where practical

**Why revisit:** Strong overlap with current engineering leadership /
platform / DevEx expectations.

------------------------------------------------------------------------


# 7. Standard Engineering Practices --- Completeness Sweep

## STD-001 --- Architecture patterns to explicitly assess

**Status:** Open\
**Priority:** P1

Assess applicability of:

-   modular monolith
-   hexagonal/ports-and-adapters
-   dependency inversion
-   bounded contexts
-   API gateway/BFF
-   event-driven architecture
-   outbox/inbox
-   idempotent consumers
-   schema evolution
-   contract testing
-   retries/backoff
-   circuit breaker
-   bulkhead
-   timeout/deadline propagation
-   graceful degradation
-   caching
-   rate limiting
-   feature flags
-   zero trust
-   least privilege
-   managed identity
-   secure secret elimination
-   threat modeling
-   data classification
-   privacy-by-design
-   observability
-   correlation/tracing
-   health/readiness
-   rollback
-   backup/restore
-   DR
-   reproducible environments

**Rule:** Assess, don't blindly implement.

------------------------------------------------------------------------

## STD-002 --- Software supply-chain security

**Status:** Proposed\
**Priority:** P1

Consider:

-   dependency scanning
-   pinned versions
-   lock files
-   SBOM
-   container image scanning
-   secret scanning
-   provenance/signing where proportionate
-   dependency update process

**Why revisit:** High-value modern engineering practice with relatively
small implementation cost.

------------------------------------------------------------------------

## STD-003 --- Secure SDLC

**Status:** Proposed\
**Priority:** P1

Assess:

-   threat modeling
-   security acceptance criteria
-   SAST
-   dependency scanning
-   secret scanning
-   DAST where useful
-   auth/authz tests
-   abuse/rate-limit tests
-   security review triggers

------------------------------------------------------------------------

## STD-004 --- Data lifecycle

**Status:** Open\
**Priority:** P1

Define:

-   classification
-   collection minimization
-   retention
-   deletion
-   export
-   correction
-   backup retention
-   test-data handling
-   sensitive-data logging rules

Particularly relevant to dietary/allergy preference data.

------------------------------------------------------------------------

## STD-005 --- Recovery / resilience

**Status:** Open\
**Priority:** P1

Define:

-   RTO
-   RPO
-   backup strategy
-   restore test
-   dependency failure strategy
-   data-loss scenarios
-   regional failure posture
-   operator runbooks

------------------------------------------------------------------------


# 15. Portfolio Continuity / Capture Reconciliation

## BAK-015 --- Decompose Redis into capabilities before selecting infrastructure

**Status:** Proposed\
**Priority:** P0/P1

Before committing to managed Redis, identify the actual capabilities
attributed to Redis, such as shared caching, idempotency, rate limiting,
temporary state, distributed locking, pub/sub/event inspection, and
other workload-specific needs.

Evaluate each independently against local implementation, Azure-native
alternatives, cost/free-tier implications, operational burden,
consistency requirements, failure behavior, and whether the capability
is actually needed.

Do not treat managed Redis as a required architectural dependency merely
because local Redis is convenient.
