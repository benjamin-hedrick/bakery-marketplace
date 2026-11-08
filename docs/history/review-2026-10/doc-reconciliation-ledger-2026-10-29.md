# Document reconciliation ledger (started 2026-10-29)

> **Status:** Historical · moved 2026-10-30 from `docs/governance/`. A working record of the October 2026 documentation review. Its findings are dispositioned in [`closing-record.md`](closing-record.md) and the live gap catalog (`docs/product/backlog/gap-catalog/`). The text is unchanged except that the names of three other repositories are replaced by labels (peer-A: a process framework; peer-B: an AI collaboration playbook; peer-C: an older playbook) and that references to files that moved were re-pointed. Relative links in it no longer work.

A working ledger for the all-folders document review. It collects findings **before** anything is fixed, so no file is reconciled twice. When a folder pass is agreed, findings move into fixes (one commit per theme) and, where they cannot be fixed at once, into `open-items-register.md`. Items 83 and 84 of the register were opened by the first pass (`project-plan.md`, `project-log.md`); the rest wait here.

## Goals and tags

| Tag | Goal |
|---|---|
| **G1** | Clean up the documents (stale, contradictory, duplicated) |
| **G2** | Gaps against the target demo, and against sharing the repo as portfolio evidence for wider sharing |
| **G3** | Skills and experience that would strengthen the portfolio evidence |
| **G4** | Inputs to planning the next phases |

Each finding says what was checked. "Checked" means read against the repo or a command's output in this session, not that the application was run.

## Folder checklist

Order agreed 2026-10-29. `[x]` = findings collected; fixes not yet made.

- [x] Root: `README.md`, `portfolio-plan.md` (above), `CLAUDE.md` (D-5), app/service/infra READMEs (D-6 to D-12)
- [x] `docs/management/project-plan.md`, `docs/project-log.md` (first pass, see below)
- [x] `docs/product`: structure, status and supersession checked (P-1 to P-12). The bodies of the 67 `WI-*.md` specs were not read line by line; only headers, status and supersession markers were checked
- [x] `docs/architecture`: read in full (25 files); the record is `doc-review/30-architecture.md`, which supersedes A-1 to A-9 (A-1 is corrected there: the capability map is business-facing and needs no BFF)
- [x] `docs/governance`: read in full (see `doc-review/40-...`)
- [x] `docs/operations`: read in full (see `doc-review/40-...`)
- [x] `docs/process`: read in full (see `doc-review/40-...`)
- [x] `docs/management`: read in full (see `doc-review/40-...`)
- [x] `docs/evidence`: read in full (see `doc-review/40-...`)

## Question answered first: what runs locally now?

Checked in `docs/operations/local-dev.md`, `docker-compose.yml` and `scripts/ci/skeleton-smoke.mjs`; **not run in this session.**

- `docker compose up -d --build` starts **infrastructure only**: `redis-events`, `cosmos` (vNext emulator), `mock-oidc`; optional `redis-cache`, tracing viewers. No application container exists (no images for catalog, ordering, BFF or web; register item 71).
- The slice-1 journey (login, browse, customize, pick a time, test checkout, confirmation) needs those containers **plus** `init-env`, the seed, `catalog-service`, `ordering-service`, the BFF and the built Next.js app as host processes.
- The one command that does all of that is `node scripts/ci/skeleton-smoke.mjs`. It starts everything, runs the Playwright suites (21 of 21 reported in `docs/evidence/slice-1/findings.md`) and stops it. `--keep` leaves **Docker** running afterwards; whether the host processes (services, BFF, web) stay up for a person to click through was not established. Nothing in the docs describes a "start the demo and click around" path.
- So slice 1 does work locally, as an automated journey; a human-operable demo is a documentation and script gap (D-1 below).

## Findings

### Root and cross-cutting

| # | Finding | Tags | Evidence |
|---|---|---|---|
| D-1 | **No documented way to run slice 1 as a person.** README says `docker-compose up`, which gives infrastructure only. `local-dev.md` "Run the walking skeleton" lists four processes without `ordering-service` or login (written for `WI-PORT-002`), and its known gap 5 says "no Next.js, BFF or trace viewer yet". Need: a `demo` script (start, wait, print URL and the mock login users, stop) and a README quick start that is true. | G1 G2 | `README.md:18`; `local-dev.md` lines 66-81 and 148; `skeleton-smoke.mjs` header |
| D-2 | **README claims the GitHub Projects board and the published docs site.** Neither exists (register 12, 13). Also says "narrate the whole idea to launch arc" is the README's job in `portfolio-plan.md`; check whether it does. | G1 G2 | `README.md:20-22`; `portfolio-plan.md:162` |
| D-3 | **`portfolio-plan.md` repo structure and artifact list are partly stale or unmet:** lists `/.github/workflows` (CI is Azure Pipelines, ADR-0015); lists `web-admin` and `web-queue-display` (empty). Planned artifacts with **no file found**: RACI, hypothetical team/hiring plan, competitive scan, monetization model, prioritization (MoSCoW/RICE), sprint plan, dependency/versioning policy, feature-flag pattern, ephemeral preview environment. Present: capability map, data-model/API contracts, NFRs, stakeholder comms plan, budget, risk register, SLA, monitoring plan. | G1 G2 G3 | `ls docs/management docs/architecture`; `portfolio-plan.md` sections 1.2 and 3 |
| D-4 | **MVP features in `portfolio-plan.md` not built:** search and dietary filtering, preferences, sponsored placement, **live order-queue display (the plan's "strongest demo moment")**, notifications, admin console, vendor onboarding (seeded only), reviews, real payments (stub). The demo story currently stops at "order placed and confirmed". | G2 G4 | `portfolio-plan.md` 1.1; `project-plan.md` Phase 2 and 3; backlog N-03 to N-14 |
| D-5 | **`CLAUDE.md` is behind in places:** ADRs "0001-0016" (index runs to 0018); the "Target shape, not yet built" paragraph (ADR-0012/0013) describes what is now built; test counts (28 catalog tests, 75 BFF) are outdated (catalog 104, ordering 337). Edit with the owner's approval (it is the instruction file). | G1 | `CLAUDE.md`; `01-project-status.md` verification table |

### `docs/management/project-plan.md`, `docs/project-log.md`

Register items **83** and **84** (already written). The project plan itself matches the repo; the project log does not. Test reliability history recovered in `docs/evidence/test-reliability/findings.md` (10 episodes; feeds goal A and the AI-collaboration page).

### Evidence for G3 (skills and experience): initial candidates, to be refined per folder

What the repo already shows: architecture decisions with amendments, contract-tested adapters, a BFF with Relay, a real-stack browser journey, tracing with a privacy scan, pipeline on Azure, security hardening of a mock issuer, a work-item and reconciliation discipline, AI-assisted delivery with recorded approvals. Candidate gaps to weigh against the demonstration goals (goals A and B below): a deployed environment (Terraform apply, Container Apps or App Service), a real managed Cosmos/Redis run, an observability dashboard with alerts, a load test with a recorded baseline, a published docs site, a short recorded demo or screenshots in the README, a vendor-facing UI, an event consumer (queue display) showing the event backbone end to end.

### Root READMEs and public-repo hygiene (G1, G2 priority 1)

| # | Finding | Evidence |
|---|---|---|
| D-6 | **`services/ordering-service/README.md` says "Scaffold only"** although it is the most developed service (337 tests, checkout, lifecycle, outbox). Same one-line scaffold text on `admin-service`, `notification-service`, `web-admin`, `web-queue-display`, which is true for those four. | READMEs read 2026-10-29 |
| D-7 | **`apps/web-customer/README.md` says "WI-PORT-001 proof only ... no auth, cart, checkout or real BFF"**; the app now has login, cart, checkout and order status. The run commands further down are probably still right; verify when fixing. | `README.md` lines 1-8 |
| D-8 | **`services/graphql-bff` has no README** although its commands and env vars live only in `CLAUDE.md`. **`tools/` has no README** (nine .NET libraries, a seed tool, a mock issuer host). | `ls` |
| D-9 | **`tools/event-schemas` and `tools/logging-helper` are empty directories holding only a README**, left over from the original plan; the real libraries are `BakeryMarketplace.EventSchemas` and `.Logging`. Remove or point. | `ls -a` |
| D-10 | `infra/README.md` is a TODO line; `docs/index.md` (the docs-site home) is two lines; neither says what exists (one Terraform module, the collector configs, `environments/`). | read |
| D-11 | **No `LICENSE`, `SECURITY.md` or `CONTRIBUTING.md`** at the root (only `.gitignore` tracked). A public repo should state a license (or "all rights reserved" on purpose) and how to report a vulnerability. | `git ls-files` |
| D-12 | **Public-readiness checks not yet done:** no secret scan of the 160-commit history has been run (gitleaks and trufflehog are not installed; a container image could do it); 16 Markdown files link to `peer-A/`, a **separate repo** a reader cannot open; tracked files look clean (no `.env`, `obj/`, `test-results/`; `.env` is ignored). Internal-process material is committed: `_incoming/` (absent now), delegation packets, worklogs, `ACTIVITY-LOG.md` (391 lines). It is evidence of AI collaboration but needs a short "how to read this" note so it reads as method, not clutter. | git and grep, 2026-10-29 |

### `docs/product` (first pass)

| # | Finding | Tags | Evidence |
|---|---|---|---|
| P-1 | **`MASTER-BACKLOG-OUTLINE.md` "On Deck" is stale (last priority note 2026-10-26)** and `CLAUDE.md` tells sessions to start there. It still leads with `WI-DEV-001` (long done) and "assign Batch 3 to agents now". The slice-1 sequence and `N-xx` next work are not in it. The header still says "Two items are already fully drafted". | G1 G4 | outline lines 3-4, 105-119 |
| P-2 | **`backlog/README.md` is stale**: "pre-Issue", "Two items are fully detailed now", and it points to the separate framework repo for the template. | G1 | read |
| P-3 | **`roadmap.md` and `okrs.md` are one-to-three-line stubs.** The README's reading list sends a visitor to the roadmap as step 5 of "the story". A real roadmap (phases from `project-plan.md`, slice 1 done, `N-xx` next) and OKRs (the vision already names four measures and a north-star safety metric) are the cheapest improvements to the business/project half of priority 1. | G1 G2 G3 | read |
| P-4 | **`EPIC-PORTFOLIO-SLICE` shows "Started ... `PORT-006` in progress"**; slice 1 is complete. Other epic headers in the outline probably lag the same way (CLAUDE.md already says the WI `Status:` field is unreliable and the outline is authoritative; the outline itself needs a status sweep). | G1 | outline line 128 |
| P-5 | **Two parallel numbering schemes** (`WI-*` / epics in the outline; `S1-xx` / `N-xx` in `slice-1/03`) and a third (register item numbers). The board needs one. | G1 G4 | |
| P-6 | **Vision and personas look sound** (34 and 31 lines; principles match what was built: dietary safety first-class, zero trust, extensible). Not yet cross-checked against the as-built dietary features, which are mostly not built (allergen flags exist on listings; preferences and filtering do not). The vision's north-star measure (zero allergy-related incidents) has no instrument. | G2 | read |
| P-7 | **Work-item headers disagree with the outline for 15 of the specs not marked Done.** The header says Ready, Blocked or In Progress; the outline says built, done or superseded: `CAT-005`, `CUST-003`, `CUST-004`, `CUST-006`, `DEV-004`, `ORD-002`, `ORD-003`, `ORD-005`, `ORD-006`, `ORD-007`, `PORT-002`, `PORT-003`, `PORT-005`, `PORT-006`, `WEB-001` (superseded). Several others (for example `DATA-001/002`, `CACHE-001..004`, `EVT-001/003`, `AUTH-001/002`, `DEV-001/003`) say Ready; I did not check whether they are built. `CLAUDE.md` already tells readers to trust the outline, but a visitor reading a spec sees "Ready". Rule says do not rewrite historical specs: the fix is a dated one-line status note at the top, or a generated status table, not edits to the body. | G1 | script over headers vs outline, 2026-10-29 |
| P-8 | **`LOCAL-MILESTONES.md` is the best existing answer to "what can I run", and it is stale.** M1 (environment up), M2 (backend skeleton) and M3 (browser demo) all say "Scoped"; M1 and M3 are largely met by slice 1 (M3's "done looks like" includes order history, which does not exist, item 80), M2 is partly met (no preferences or vendor onboarding). Rewriting it as a demo-milestone status table with a "how to run" column and the gaps would answer the user's question and feed the README (D-1) and the roadmap (P-3). | G1 G2 G4 | `LOCAL-MILESTONES.md` |
| P-9 | **`PARKING-LOT.md` is stale and refers to files that do not exist** (`worklog-2026-09-07.md` is not in the repo) and to the separate framework repo. Its still-open items (APIM versioning, refresh tokens, shared frontend package extraction) duplicate or belong in the register (24 is refresh tokens; shared package maps to goal B's gap). | G1 | read |
| P-10 | **Historical and process material mixed with live planning in one folder:** `BATCH-5-CURATION.md`, `RECONCILIATION-2026-09-28.md`, `docs/history/sept-2026-delegation/` (7 packets and wave notes), `worklog/` (3 files plus reconciliation records, about 2,200 lines in total), `EPIC-*.md` with their own stale status lines (`EPIC-WEB-CUSTOMER`: "none built yet"; `EPIC-PORTFOLIO-SLICE`: "1 in progress"). A reader cannot tell active from historical without opening each. **Option for the human lead:** keep the active set (`MASTER-BACKLOG-OUTLINE`, `WI-*`, `EPIC-*`, `README`) in `backlog/`, move packets, worklog, batch curation and the 2026-09-28 reconciliation to a clearly labelled `docs/history/` (or `docs/product/backlog/archive/`) with a one-paragraph "why this is kept" note, since it is real evidence of the AI-delegation method (goal A and 2 both ask about AI collaboration). Moving changes links; needs a link check. | G1 G2 | |
| P-11 | **A document status convention is missing.** Statuses used across the repo: Ready, Done, Built, Proposed, In Review, Blocked, "Review - content complete", SUPERSEDED (sometimes only in the outline). No page defines them, and "Ready" has meant "specified" and "built" at different times. Define one set (Draft, Ready, In progress, Built, Done, Superseded, Archived), say where status is authoritative, and put the status line first in every file. | G1 | |
| P-12 | **The outline is 429 lines mixing queue, epics, build order and gaps.** The queue and "On Deck" parts are the most stale; the epic list is the most useful and could become the roadmap's source. Splitting "current plan" (short, kept fresh) from "epic catalog" (long, stable) would make the freshness problem smaller. | G1 G4 | outline structure |

### `docs/architecture` (G1, G2; the Architect hat is the core of priority 1)

| # | Finding | Tags | Evidence |
|---|---|---|---|
| A-1 | **The C4 diagrams do not show the architecture that was built.** `c4/container.md` and `c4/context.md` have zero mentions of the BFF, GraphQL, Relay or Next.js, the centre of ADR-0012/0013, and `capability-map.md` has none either. They draw `web-queue-display` and `web-admin` as live containers beside services that exist. `c4/README.md` promises `component-*.md` files; none exist (`ARCH-005`, low priority). For an architecture portfolio this is the single most visible gap: the diagrams a reader opens first predate the design. Needs a container diagram with built / planned styling, a request-path diagram (browser to BFF to services, with the trace) and one component diagram (ordering-service). | G1 G2 G3 | grep counts, `ls c4` |
| A-2 | **Stale status lines on accepted ADRs:** 0012 and 0013 say "validation pending `WI-PORT-001`/`-002`" in the header, though 0012 has a validation outcome section and both were exercised by slice 1; 0015 says "Migration in progress: GitHub Actions remains in place" though its own 2026-10-28 amendment says the placeholder was removed; 0016 header also carries "Validat..." pending text; 0018 is "Proposed" with phase 1 built (accurate, but see register 62). Rule: do not rewrite decisions, so fix by a dated status note, not by editing the Context/Decision text. | G1 | ADR headers |
| A-3 | **ADR index inconsistencies:** it says `0000-template.md` was renamed to `template.md` "to avoid being mistaken for a real decision", but **both files still exist** (identical bar the title). The "Amended ADRs" list stops at 0008 and omits 0010 (.NET 10), 0016 (backends by environment), 0017 (refines 0009) and 0018 (amends 0006, which has the amendment note). The ADR 0006 row still reads "Azure AD B2C" while its Entra External ID amendment stands (register 21). Add a status column (Accepted, Amended, Superseded, Proposed) to the index. | G1 | `ls adr`, `adr/README.md` |
| A-4 | **`tech-stack.md` overclaims in places:** CI/CD row says "workload identity federation to Azure (no stored secrets) ... Confirmed", but nothing has been deployed and nothing federates to Azure yet (pipeline runs on Azure DevOps agents with no cloud target); the frontend row still says "validation pending `WI-PORT-001`". A "Confirmed" column should mean decided, and a separate "Built / Verified" column (as the rest of the repo requires) should say what was run. | G1 G2 | `tech-stack.md` lines 18, 32 |
| A-5 | **No API specification exists.** No OpenAPI/Swagger file, no `.http` collection and no generated spec in any service; the C# services expose endpoints that `data-model-api-contracts.md` (318 lines of prose and tables) describes, and its own banner says the paths are "illustrative" and still blocked on an APIM versioning decision (`PARKING-LOT.md`) although the paths are in use. Contract documentation by hand will drift (it already has: see the banner). An OpenAPI document generated from the services, plus contract tests between the BFF client and that document, would serve goal A (API/integration testing) and goal B (REST vs GraphQL) at once. | G1 G2 G3 | grep for openapi |
| A-6 | **`data-model-api-contracts.md` mixes target and as-built.** Its header says every endpoint routes through APIM (not true locally and not deployed), contains moved-in slice sections, and a "First-slice mapping" table. Split into "as-built API reference" (generated, A-5) and "target model". | G1 | read |
| A-7 | **`first-slice-contract.md` is a record, and says so** ("slice-scope record"; reconciled in `S1-09`). Fine; give it a clear place (for example under `docs/architecture/slice-1/` or linked from the slice-1 status) and make the header state which sections are historical. | G1 | header |
| A-8 | **NFR numbers are planning assumptions, not measured** (50 concurrent users, 200 orders a day; the document says so). There is no load baseline for any path. goal B calls for caching/latency tradeoffs and goal A for execution performance: a small k6 or Playwright-based timing run with a recorded result (and the 4.7 s cold checkout already noted) would turn assumptions into evidence. | G2 G3 G4 | `nfrs.md` line 9 |
| A-9 | **ADR set quality is high** (18 records, dated amendments instead of rewrites, one superseded with the status kept). That discipline is worth showing: a one-page "decision timeline" (what was decided when, what changed and why, e.g. 0011 to 0012 and Entra) would be a strong architecture artifact. | G2 G3 | index |

### Priorities (human lead, 2026-10-29; may be refined)

1. A polished, consistent repo, to become public and be shared publicly, showing AI collaboration, architecture and software experience, and business/project experience.
2. Build and run locally.
3. Expand the evidence behind priority 1 and cover more capabilities.
4. Deploy and tear down a real dev environment.
5. A publicly deployed demo (keep working toward it; not needed yet).

Consequences for the review: G2 gaps are ranked against these five, in this order. The public-repo goal makes tone, internal-only material (`_incoming/`, delegation packets, worklogs, ACTIVITY-LOG), secrets history and the README front door part of the review. Slice 1 was arranged around a set of capabilities to demonstrate (goals A and B below); the coverage map (G3) is built from them.

### Open questions for the human lead

1. The capability goals for G3 (to be supplied by the lead): needed for the G3 coverage map.
2. The board (register 12): mirror the `S1-xx` and `N-xx` items, the epics in the outline, or both? Human lead wants to review what the `S` and `N` items are first.

## Goal A: test automation and quality architecture

Capabilities to demonstrate (set by the lead, 2026-10-29; the mapping below is the record): test automation and quality architecture for web and mobile systems: reusable frameworks, automated tests in CI/CD (Azure DevOps), quality metrics (flake risk, execution time, release gates) and an AI-assisted approach.

| Requirement | Evidence in the repo (checked by reading, not re-run) | Gap | Tags |
|---|---|---|---|
| Playwright (TypeScript), framework design | `apps/web-customer/tests/{e2e,skeleton,unit}`; journey, login, issuer and stack specs run against the real stack (`docs/evidence/slice-1/findings.md`) | Specs are not described as a framework (page objects, fixtures, shared helpers, conventions) in any one document | G2 G3 |
| **Maestro (YAML), mobile** | none | **No mobile app and no Maestro flow.** Largest hole against this goal. Smallest credible step: a Maestro flow, if Maestro can drive the web build (verify its current web support) or a thin mobile client | G3 |
| API and integration testing; system-level validation | 337 ordering, 104 catalog and 133 auth tests; HTTP-level tests of the real services; `stack.spec.ts` checks BFF to ordering to catalog | No contract tests between BFF and services as a named layer; no consumer-driven contracts | G3 |
| Black and white box, test strategy | Test layers exist (unit, adapter contract tests, service, browser) | **No test-strategy document** naming the layers, what each proves, and what is deliberately not tested | G2 G3 |
| CI/CD, Azure DevOps | `azure-pipelines.yml` (format, lint, build, .NET, BFF, mock browser tests, real-stack smoke); green run `#20261029.4` | Soft gate only (register 45); `ubuntu-26.04` half open (44) | G2 |
| Quality metrics: flake risk, execution time, release gates | `scripts/ci/summarize-results.mjs` writes per-run JSON with passed/failed/skipped and time; `docs/process/quality-gates.md` defines the evidence format; about 90 mutation checks reported in slice 1 | **No trend across runs and no flake measurement** (the JSON is per run, nothing aggregates it); release gates are listed but not expressed as a pass/fail policy; no report that leadership could read | G2 G3 G4 |
| Review and onboarding practice | `docs/process/engineering-standards.md`, definition of done/ready (to review) | No review guide or onboarding path for a test framework; no short design-review artifact | G3 |
| AI-first automation | The whole repo is AI-assisted; approvals recorded; `docs/management/portfolio-slice/04-cache-and-ai-evidence.md` | No page that states how AI was used for tests (generation, mutation-check loop, review), what it got wrong, and the guardrails. This is the differentiator for priority 1 | G2 G3 |
| Tracking and traceability tools | GitHub and Claude are used. Backlog is Markdown plus a planned GitHub Project | No requirement-to-test table existed; a traceability table (work item to tests) would show the idea without a tracking tool | G3 |
| Technical writing and outcome metrics | ADRs, evidence files, status documents | Findings are strong but scattered; one front-door narrative is missing (D-2) | G2 |

Implication for the next phases (G4): the slice-1 plan fits this role well on the web side. The cheapest additions that raise coverage are documentary and analytic (a test-strategy page, a framework guide, a quality-metrics report with a flake trend, an AI-in-testing page, a traceability table), then one small Maestro or mobile proof. None needs a deployment.

## Goal B: web platform and client data fetching (GraphQL/REST, Relay)

Capabilities to demonstrate (set by the lead, 2026-10-29): a web layer with a clear technical direction, with a focus on client data fetching in a hybrid GraphQL/REST environment; caching, consistency, latency and developer ergonomics; Node, SSR, Relay; reusable patterns, standards and documentation; design system and code health. Also to show: how AI collaboration is controlled, and why the approach was chosen.

| Requirement | Evidence in the repo (read, not re-run) | Gap | Tags |
|---|---|---|---|
| Client-side data architecture, Relay | `apps/web-customer`: Relay queries, fragments and a refetchable list (`ListingsList`, `__generated__/`), ADR-0012/0013/0014, `PORT-006`/`PORT-007` | No page explaining the data-fetching design as a whole: fetch placement (SSR vs client), store policy, error and loading conventions, what Relay buys over plain fetch | G2 G3 |
| Caching, consistency, latency tradeoffs | ADR-0014 (three layers, order data never cached, authenticated responses `private, no-store`); server cache with fallback and chaos tests; 200-concurrent-SSR isolation test | No measured client-side numbers (cache hit rate, time to first byte, query counts per page); no write-then-read consistency story for the Relay store after `placeOrder` stated as a tested behavior | G3 |
| GraphQL and REST, judgment on when each | BFF (GraphQL) over C# REST services, with error mapping (ADR-0013) | **No decision rule for "when GraphQL, when REST"** beyond "BFF composes"; no example where the client deliberately uses REST (for instance uploads or health) and why | G2 G3 |
| Node, SSR | Next.js Pages Router, SSR only for public listing pages; Node BFF (75 tests); hand-rolled OTLP in the Node tiers (register 36) | Authenticated SSR deferred (26); no streaming or caching strategy for SSR | G3 |
| Reusable patterns, standards, documentation; paved paths | One app; shared code is local (`lib/auth`, `lib/cart`, `lib/relay`) | **No shared web package, no design system, no component library, no "paved path" guide.** `web-admin` and `web-queue-display` are empty, so reuse across apps is not demonstrated | G3 G4 |
| Code health, developer experience | Prettier, ESLint, typecheck, Relay compile in CI; mock GraphQL server and a mock-backed browser suite (57 tests) | No documented developer workflow for adding a screen or a field (schema change to Relay artifact to test) | G2 G3 |
| Architecture review practice | ADRs with dated amendments, reconciliation records, `architecture-review.md` | Hypothetical-team artifacts (RACI, review guide) absent (D-3) | G3 |
| Collaboration with AI, explaining your approach | Same asset as goal A: approvals, mutation checks, reconciliation | The AI-collaboration page (goal A) serves both goals; add an account of decisions the human lead made versus delegated | G2 |

## What the two goals share (input to G4)

- **Both want written technical direction**: a test-strategy page (goal A) and a web data-fetching guide (goal B) are small, mostly documentary, and use work that is already built.
- **Both want an AI-collaboration account** that explains the approach, the guardrails and the failures. One page can serve both.
- **Both want a second app or surface to show reuse**: the empty `web-queue-display` (the plan's "strongest demo moment", `N-04`) would also prove the shared-package story for goal B and give goal A a second Playwright target. It needs `N-03` first (a vendor read model); a lighter queue display fed directly from order events may be possible and would need an ADR check.
- **Goal A alone needs mobile/Maestro**; goal B alone needs a design-system or component-library story.

## Peer repos (scope agreed 2026-10-29): `peer-A` (read in full, 34 of 34 files)

Read file by file, 2026-10-29. Last commit in the repo: 2026-10-25, i.e. **before** the portfolio-slice decisions and everything built in slice 1 (2026-10-26 to 29). Nothing in the peer repos has been edited. Self-containment direction (human lead): the bakery repo stays the one self-contained repo that is shared; relevant pieces of the peers are copied in as needed, and ideally the process and playbook, having informed the project, are already visible in it as-used artifacts.

### What the repo is

| Area | Files (lines) | State |
|---|---|---|
| Front door | `README.md` (15) | Says "four folders" but describes five, and omits `exploration/`, `templates/`, `governance/` |
| `core/` | `artifact-roles` (28), `checklists` (47), `context-completeness` (32), `phase-sequence` (55) | Coherent and domain-agnostic; Phase 8 had never been exercised when written |
| `domains/software-systems/` | `README`, `adr-template`, `architecture-patterns` (46), `artifact-catalog-template` (68) | Sound; the patterns file stops at what ADR-0001 to 0010 produced |
| `methodologies/` | `agile`, `togaf`, `safe` (an honest stub) | Fine |
| `templates/` | work item (132), two checklists, activity log, parking lot, README | The work-item template is the most used asset (67 specs in bakery) |
| `discovery/`, `governance/` | `discovery/README` (24), `architecture-review-template` (15) | Discovery has a promotion rule but holds no items; the governance template is empty prompts |
| `case-studies/bakery-marketplace.md` | 29 | Frozen at "seven ADRs", "Phase 8 not yet reached", "multi-agent not validated" |
| `exploration/` | artifact-landscape plan (223) and README; governance exploration (350); permit-to-build (145) and permit-to-operate (129) templates; lessons log (130, PI-001 to PI-007, all "Hypothesis"); worklog area: two 2026-09-28 worklogs (1,153 and 844 lines), a supersession note, a reconciliation record | Real ideas, unpromoted; the two worklogs are over half of the repo's lines |

### Findings (F-)

| # | Finding | Tags |
|---|---|---|
| F-1 | **The case study is the most outdated and the most valuable document to update.** Bakery now has 18 ADRs, a built and verified slice, a real CI run, 7 delegation packets, human approval gates, evidence records, a reconciliation discipline and 10 documented test-reliability episodes. The case study says Phase 8 is "not yet reached" and multi-agent work is "not validated". It is where a reader sees the process meeting reality. | G2 G3 |
| F-2 | **Lessons log PI-001 to PI-007 are all "Hypothesis", and bakery now holds evidence for several:** PI-001 surprise-as-trigger (sold-out options hidden, the spent idempotency key, the flake episodes), PI-003 context completeness (delegation packets, "you do not need to know"), PI-005 local-first as evidence (real-stack journey, Linux container check, trace privacy scan), PI-007 AI suitability field. Promote or refute with citations. New lessons to add: a clean agent finds what a developer machine hides (7 of 10 episodes); a test is not evidence until it has been made to fail (about 90 mutation checks); first hypotheses are often wrong; the real stack beat the mocks (2 bugs); append-at-top logs conflict across branches (bakery item 50). | G2 G3 |
| F-3 | **`exploration/` and `discovery/` overlap without a rule.** `discovery/README` defines trying changes against real work before promotion, but all the candidate material (permits, lessons, artifact landscape) sits in `exploration/`, and the root README never mentions it. Needs one sentence (discovery is the process, `exploration/` its working area) and a promotion log. | G1 |
| F-4 | **Three copies of a ~1,150-line coordination worklog.** The worklog's header says an identical copy is placed in all three repos; bakery has one at `docs/product/backlog/worklog/` (1,152 lines). That is the duplication hazard the header itself warns about. For a public portfolio they are noise unless framed. Pick one home (suggest the process repo, as history) and leave a pointer elsewhere. | G1 G2 |
| F-5 | **The recorded "V2" direction was not followed as written, and no document says so.** V2-001/002 (accepted) describe a fresh parallel implementation on a new stack in a minimal "Bakery V2" repo plus an "everything else" repo. What happened: the existing bakery repo took the portfolio-slice decisions (ADR-0012 to 0016) and built slice 1 in place. "V2" appears nowhere in bakery outside the worklog copies. It needs a dated disposition (adjusted: V2 became the portfolio slice in the same repo) so nobody reads V2-002 as the plan. | G1 |
| F-6 | **Worklog item statuses are frozen at 2026-09-28.** All PROC items read Open or Proposed. Several have been done in bakery in practice: DoR and DoD documents (PROC-005/006, `docs/process/`), an Architecture-Approved style flow with human approval gates (PROC-013), a minimum professional set (PROC-015, `portfolio-slice/`), exceptions via ADR amendments (PROC-012). PROC-023 (freshness model) is still undone (bakery P-11). Needs a status sweep with evidence links. | G1 G4 |
| F-7 | **The supersession note still says "Status: Proposed. Confirm on merge"**, though the 2026-10-25 reconciliation applied it (markers exist in the exploration plan and ART-015). Close it. | G1 |
| F-8 | **Permit to Build / Operate templates are unexercised, but bakery did the substance without the paperwork:** ADR-0017 (stock) and the lifecycle design were reviewed and approved by the human lead before building (a Permit to Build in effect); `docs/evidence/slice-1/findings.md` and the Azure run record are a Permit to Operate-style evidence pack for a local environment. Try the templates once, retrospectively, on slice 1 (one filled-in example of each is a strong leadership artifact), then promote or simplify. | G2 G3 |
| F-9 | **The work-item template leaks project specifics and lags its use:** it mentions `docs/process/definition-of-done.md` and "ADR-0007 for the bakery project" inside a domain-agnostic file; its status set is `Not Started / Ready / In Progress / Review / Done` while bakery uses Built, Proposed, Blocked, Superseded and "Review - content complete" (bakery P-11). Add Superseded and Built/Verified, and a rule that status is the first line. | G1 |
| F-10 | **Templates the process needs but does not contain.** Referenced or practised with no template: open-items register (named in `context-completeness` and the checklists), reconciliation record, evidence/findings record, project log / artifact index, ADR index with a status column, status vocabulary, a document-review ledger (this exercise), quality gates and evidence format (`summarize-results`), test strategy. All exist in bakery in a form that could be generalized. | G3 G4 |
| F-11 | **The artifact catalog has no Quality / Test hat** and nothing for API specification, evidence records or AI-collaboration records. Bakery's quality work (test layers, flake evidence, mutation checks, trace privacy) has no home in the catalog. This also maps to goal A. | G3 |
| F-12 | **The architecture-patterns file stops at ADR-0010.** Patterns bakery has since proven and that repeat across decisions: outbox with inline publish, relay and deterministic event ids; idempotency with a spent-key rule; reserve/release with a final released state; BFF as composition, not domain; test-only hooks that cannot be enabled outside tests; a real-stack acceptance journey; clean-agent verification; a trace data-safety scan. Route through `discovery/` per its own rule. | G3 |
| F-13 | **Checklists and phase sequence lack the verification and maintenance loops bakery needed:** a recurring reconciliation pass (status, supersession, freshness), clean-environment verification before declaring done, and the rule "do not call anything working unless run" (`CLAUDE.md`). Phase 8 is one paragraph; bakery now has material to make it concrete. | G3 G4 |
| F-14 | **`governance/architecture-review-template` is empty prompts**, while `exploration/governance/` holds a 350-line worked proposal. Promote a short version or point the template at the exploration draft. | G1 |
| F-15 | **The repo has no license, no last-reviewed markers and no note for outside readers.** If it is shared on its own it needs a front door; if it is only copied into bakery, it does not. | G1 G2 |

### Decisions on the peers (human lead, 2026-10-29) — these replace the earlier "candidate shape"

1. **Everything stays in bakery for now.** Evidence updates and "what is proven" documentation are written in bakery, not in the peer repos. No peer repo is edited during this reconciliation.
2. **`docs/method/` is approved** (name may be refined) for as-used process artifacts: how work items are written and statuses used, the reconciliation practice, the AI-collaboration record, test strategy, evidence format.
3. **No links or references to the process framework or the playbook from bakery.** Where a peer idea is used, bakery carries its own implementation copy. The model is how Agile is applied: a team follows the patterns and the process; it does not reproduce the manifesto or define what a sprint is in its own documents. So bakery documents say what bakery does, not "per the framework". The 16 existing links (`peer-A/...`) are to be removed or replaced by inline content during the edit pass.
4. **Peer content that adds value and is not yet demonstrated in bakery is to be copied in** (adapted, as bakery's own), not linked.
5. **The peers are not being shared for now.** If exposing them shows extra maturity, rigor or experience, the decision is to be reconsidered, and links and references could then be used.
6. **Cross-check plan:** when the bakery reconciliation proceeds, every F- item above is cross-checked against the bakery document it touches (table below), and the same will be done for the playbook after its analysis. Items that the peers contain and bakery does not demonstrate become "copy in" tasks.

#### Cross-check table (to be worked during the bakery folder passes)

| F- item | Bakery place to check, or create | Action when that document is reached |
|---|---|---|
| F-1 case study | `docs/method/` (as-used account: how the process met reality), plus the portfolio narrative in the README | Write from bakery evidence; do not touch the peer |
| F-2 lessons (PI-001 to 007, new lessons) | `docs/method/` lessons record, citing `docs/evidence/test-reliability/` and slice-1 findings | Verdicts with bakery citations |
| F-3 discovery vs exploration | Not a bakery concern unless bakery uses a promotion rule | Skip unless bakery needs it |
| F-4 triple worklog copies | `docs/product/backlog/worklog/` (bakery copy) | Decide archive (see bakery P-10) |
| F-5 V2 direction | worklog copy in bakery (add dated disposition) | See disposition below |
| F-6 PROC statuses | `docs/process/`, `project-plan.md` | Confirm which PROC items bakery actually does, record as practice |
| F-7 supersession "Proposed" | bakery copy of `supersession-2026-09-28.md` | Close with date |
| F-8 permits | `docs/method/` (one retrospective Permit to Build and one Permit to Operate on slice 1) | Copy templates in, fill once, then keep or simplify |
| F-9 work-item template | `docs/product/backlog/` work-item conventions, status vocabulary (bakery P-11) | Define bakery's own statuses |
| F-10 missing templates | `docs/method/` and `docs/process/` | Register, reconciliation record, evidence record, ADR index, status vocabulary, review ledger, test strategy |
| F-11 quality hat | `docs/process/` (test strategy, quality gates) | Create test strategy; maps to goal A |
| F-12 patterns | `docs/architecture/` (patterns page with bakery code references) | Document as bakery patterns |
| F-13 verification/maintenance loops | `docs/process/` | Record clean-environment verification and the reconciliation pass as practice |
| F-14 architecture review template | `docs/governance/architecture-review.md` | Compare, keep bakery's |
| F-15 front door | n/a (peer only) | n/a |

#### V2 disposition (F-5), recorded by the human lead

V2 was planned as the next iteration (a fresh implementation on a new stack). It was **deferred in favour of continuing V1 and building the slices**, which were judged a better and faster path to evidence for the demonstration goals. V2 is deferred, not cancelled. Bakery's copy of the worklog should get a dated note saying so, without rewriting its items.

### Peer repos still to read
None. The tracked copy-in list is `docs/governance/peer-copy-in-register.md` (CI-01 and onward); work it during each bakery folder pass. The playbook and the older playbook are covered in the next section. Findings stay in this ledger, in bakery.

### Peer repos still to read
`peer-B` (30 files) and `peer-C` (7 files, suspected obsolete).

## Peer repos: `peer-B` (read in full, 30 of 30 files) and `peer-C` (read in full, 7 of 7)

Read file by file, 2026-10-29. Roles of the three main repos (human lead, 2026-10-29): **bakery** is the implementation, testbed, experimentation and evidence of everything together; **peer-A** is the starting point for the next clean start; **peer-B** is the place for extended information and the same theory, experiment, learn, iterate loop for AI collaboration. Cross-checks run in both directions: bakery documents are checked against the peers, and peers are updated later from bakery's evidence. The playbook's last commit is 2026-10-25, before slice 1.

### What the playbook is

| Area | Files (lines) | State |
|---|---|---|
| Front door | `README.md` (15) | Lists only 5 of its contents; omits delegation packets, handoff integrity, context efficiency, seed kit, continuity, `delegation/` |
| Working style | `prompting-patterns` (27), `workflow-discipline` (40), `context-management` (31), `context-efficiency` (40), `handoff-integrity` (41) | Strong and specific; three real failure modes (stale spec, ID collision, status left as a question) each tied to an incident |
| Delegation packets (Sept) | `levels` (63), `lifecycle` (32), `authoring-guide` (66), `review-checklist` (57), three level templates (85, 75, 78) | A complete, internally consistent system (levels 1 to 3, footprint, citation discipline, purge by default) |
| Experimental delegation (V2) | `delegation/delegation-task-v0.1` (146), `renderer-rules-v0.1` (176) | Marked experimental and untested (pending ART-022); nothing indicates ART-022 was ever run |
| Seed kit | `project-seed-kit` (33), `PROJECT-AI-CONVENTIONS-TEMPLATE` (55) | The template still points back to the playbook, which its own backlog calls the top open item |
| Trackers | `playbook-backlog` (17), `cross-repo-parking-lot` (63), `open-questions` (51), `ACTIVITY-LOG` (39, last entry 2026-09-19) | Honest and current as of September |
| Case study | `case-studies/bakery-marketplace` (35) | Covers only the planning and ADR phase |
| Continuity and worklog | `continuity/portfolio-continuity-audit` (375), worklog area: coordination worklog (1,153, byte-identical to the framework copy), playbook extract (451), supersession note (identical), reconciliation record | Large history; the coordination worklog is a third copy |

### Findings (G-)

| # | Finding | Tags |
|---|---|---|
| G-1 | **The playbook describes the September way of working (packets handed to agents) and not the October way (slice 1) that produced the evidence.** Bakery's seven packets (01 to 07, Sept) carry no declared level, though the level system was written afterwards. Slice 1 was built in interactive sessions governed by `CLAUDE.md`, human approval gates, persistent memory notes, themed branches with a commit per work item, an open-items register updated in the same change, mutation checks, clean-agent verification and evidence records. None of that is in the playbook. This is the most relevant AI-collaboration evidence the project has, and no document tells it as a story. | G2 G3 |
| G-2 | **Bakery's `CLAUDE.md` is the realized seed kit.** The playbook's own backlog has open: "decide the conventions file's actual name (CLAUDE.md, AGENTS.md or own file)" and "close the seed kit's self-containment gap". Bakery answered both by doing it: `CLAUDE.md` is self-contained, project-specific, and includes rules the template lacks: report passed, failed, not-run and blocked separately; do not call anything working unless run; a "Human approval required" list (security, auth logic, IAM; expanding scope or refactoring); shared-file ownership; the register rule. Document it in `docs/method/` as how bakery directs its AI collaborators. | G2 G3 |
| G-3 | **Real AI failure modes with evidence exist and are not recorded as such.** From the test-reliability record: the AI wrote flaky tests (twice reported as "a flaky test of mine"), a portability bug (`Uri.TryCreate` on Linux), tests that asserted the wrong behavior (spent key), and a regex that only matched one time zone. Each was caught by a gate (Azure, Linux container, real stack, mutation checks) and not by the author. A reader asking how AI collaboration is controlled wants exactly this: what it got wrong, and which guardrail caught it. | G2 G3 |
| G-4 | **Two delegation models coexist without a verdict.** Packet levels say: small footprint, pointer-list ceiling of 3 to 4, duplication is fine, purge after use. Renderer rules v0.1 say: targeted sufficient context, not minimum; render just in time from a durable work item; include useful context regardless of size. They are reconcilable (footprint is about the size of the change, not of the context), but no document says so, and `context-efficiency.md` still describes sufficiency in "minimum" terms. | G1 |
| G-5 | **Stale cross-references inside the playbook.** `context-efficiency.md` and `handoff-integrity.md` cite `delegation-packet-template.md`, which no longer exists (split into three level templates). `delegation-packet-levels.md` refers to a "planned lessons-capture note" in `playbook-backlog.md`; the review checklist says it was folded in. `context-management.md` and `open-questions.md` refer to "`peer-B`" from inside that repo. | G1 |
| G-6 | **The README lists 5 of about 12 content groups.** A visitor never learns that delegation packets, handoff integrity, the seed kit, continuity or the experimental renderer exist. | G1 |
| G-7 | **Open questions now have answers in bakery.** (a) Multi-agent coordination: sequential multi-session work only; no concurrent agents (still true). (b) "Interfaces frozen" doc: bakery's contract tests plus the first-slice contract served this role; no evidence either way for a separate doc. (c) RAG vs curated context: curated won in practice (work items, `CLAUDE.md`, the register); retrieval never needed. (d) Promote to a Skill: the Claude Code skills and memory used in these sessions are a form of this. Each should be answered with a bakery citation. | G3 |
| G-8 | **Playbook rules bakery demonstrably follows, and rules it has not exercised.** Followed with evidence: state assumptions first; analysis versus generation intent (this very session); narrow scope; surprise as trigger; consistency audits (this reconciliation); open-item capture in two tiers (WI open points, register); status as a stated fact. Not exercised: levels 2 and 3 packets, the renderer, the session identifier, agent roles, permission tiers, AI audit trail, effectiveness metrics (AI-002 to AI-010). Do not claim the unexercised ones in the bakery narrative. | G2 |
| G-9 | **Copies of the coordination worklog have drifted.** The framework and playbook copies are byte-identical; bakery's differs by one deliberate edit (it removed an audience reference from the case-study item, already a public-readiness change). A header claiming "identical copy in all three repos" is now false, and the other two still contain the older audience wording (relevant only if those repos are ever shared). | G1 G2 |
| G-10 | **Continuity audit (375 lines) is a point-in-time baseline through 2026-09-10** that also folds in later "follow-ups" up to 2026-09-11, with its own "minimum sufficient context" wording superseded by V2-010 (marker present). Useful as history; as a live document it reads as a log. | G1 |
| G-11 | **The continuity protocol (durable IDs, routing, session closure, reconciliation) is proposed in the playbook and practised in bakery** under other names: WI IDs, the open-items register, `docs/evidence/`, commit messages mapped to one work item, "put what happened in the commit message and the register". The ACTIVITY-LOG pause (bakery item 50) is a lesson: an append-at-top log breaks under parallel branches, which the protocol does not address. | G3 |
| G-12 | **`peer-C` is obsolete, confirmed by comparison.** 7 files, 2 commits, the last on 2026-09-05. Its ADR template and artifact catalog are byte-identical to the framework's; its architecture patterns are the same minus the last two patterns; its phase sequence, checklists and "working with AI" notes are earlier versions of `core/phase-sequence`, `core/checklists`, and the playbook's prompting, context and workflow files. One idea is not carried over: its README's framing that simulation and staging techniques (hypothetical team, staged incident) are real practice and not "fake-project" tricks. That framing is worth keeping in `docs/method/`. Nothing else is unique. Recommendation: retire it (archive tag, then delete or mark deprecated); no content loss beyond that one paragraph. | G1 |

### Playbook content that adds value and is not yet demonstrated in bakery (copy-in candidates, adapted, no links)

1. **Handoff integrity**: the three failure modes and their rules (check the source of truth, check IDs before assigning, state status as a fact). Bakery should state them as its own rules with its own incidents (packet 5, the `WI-DEV-001` ID collision, `WI-AUTH-005` drift are all bakery events).
2. **Delegation packets**: levels, footprint, citation discipline, lifecycle and the checklist, as the bakery method for delegated work, with the seven real packets as examples. Keep only what bakery would actually use; mark levels 2 and 3 as defined and not exercised.
3. **Hard invariant versus guided default** authoring pattern (from the playbook backlog); bakery's `CLAUDE.md` and quality gates already mix both without saying so.
4. **Two axes of "local fallback"** (target implementation versus fallback chain): precise language for bakery's cache, events and data adapters (ADR-0002, 0003, 0004). It would sharpen `docs/architecture/` for goal B's caching topics.
5. **Prompting patterns and workflow discipline**: only as condensed, bakery-voiced conventions (what works with the assistant in this repo), not as theory.
6. **The standards-modules idea** (concerns decomposed, selected per project, verified by) maps to bakery's `quality-gates.md` and secure-coding baseline; only worth copying the hard/guided split.

### Cross-check table additions (playbook items to check during each bakery folder pass)

| G- item | Bakery place to check or create | Action when reached |
|---|---|---|
| G-1, G-3 | `docs/method/` AI-collaboration record | Write the October story and the failure-and-guardrail table from `docs/evidence/test-reliability/` and slice-1 findings |
| G-2 | `CLAUDE.md`, `docs/method/` | Describe `CLAUDE.md` as the conventions file; confirm its rules against the playbook list; edit `CLAUDE.md` only with the lead's approval |
| G-4 | `docs/method/` | State one position: footprint bounds the change, context is sufficient not minimal |
| G-7, G-8 | `docs/method/` | Answer the open questions with bakery citations; list unexercised practices as such |
| G-9 | bakery worklog copy | Archive with the rest (P-10) or keep one dated copy |
| G-11 | `docs/process/`, register rule | Document the capture-and-route practice as bakery's own; record the ACTIVITY-LOG lesson |
| G-12 | none in bakery | Peer retirement is outside this reconciliation; keep the "simulation technique" paragraph for `docs/method/` |
| copy-in 1 to 6 | `docs/method/`, `docs/architecture/` | Adapt and add as bakery's own, no links |

### Summary of the two playbooks
`peer-B` is valuable and half a step behind: its September packet system is thorough, its experimental renderer is untested, and the October way of working that produced slice 1 is the missing chapter. `peer-C` is a superseded early draft.


## Decisions on the bakery review findings (human lead, 2026-10-29)

1. `CLAUDE.md` may be corrected (list in `doc-review/52-edit-plan.md` section D).
2. History folder: the finished **instances** (packets, worklogs, September planning documents) are archived, the live folders stay; archiving happens as items are reconciled and their status is tracked. Status is not yet tracked consistently, so the status table (`T-08`) comes first.
3. `adr/0000-template.md` may be removed (duplicate). `WI-DEV-003.md`: pending.
4. and 5. Define the template, statuses, glossary and note formats first, then apply them consistently (`52`, sections A and B); further edits listed in `52` section C.
6. `docs/method/` approved; populated as the work proceeds.
7. Target document map, reorganization plan and edit plan drafted as `doc-review/50`, `51`, `52`.

**Resume point:** `doc-review/60-resume-here.md` (state, decisions made and open, to-do list, work items to create). Details for diagrams, API, checklists, templates and evidence: `doc-review/61-gap-details-diagrams-api-checklists-backfill.md`.
