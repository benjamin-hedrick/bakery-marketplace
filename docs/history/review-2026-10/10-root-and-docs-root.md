# Review record: repository root and `docs/` root (2026-10-29)

> **Status:** Historical · moved 2026-10-30 from `docs/governance/`. A working record of the October 2026 documentation review. Its findings are dispositioned in [`closing-record.md`](closing-record.md) and the live gap catalog (`docs/product/backlog/gap-catalog/`). The text is unchanged except that the names of three other repositories are replaced by labels (peer-A: a process framework; peer-B: an AI collaboration playbook; peer-C: an older playbook) and that references to files that moved were re-pointed. Relative links in it no longer work.

Read in full this pass: `README.md`, `portfolio-plan.md`, `local-demo-execution-plan.md` (found after the first draft), `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/settings.json`, `mkdocs.yml`, `docs/index.md`, `docs/project-log.md`, `docs/history/ACTIVITY-LOG.md`, `apps/web-customer/README.md`, the `README.md` of `apps/web-admin`, `apps/web-queue-display`, `services/{catalog,ordering,admin,notification}-service`, `infra`, `tools/event-schemas`, `tools/logging-helper`. Facts checked against `docs/evidence/facts-sheet-2026-10-29.md`. Peer-copy items refer to `docs/governance/peer-copy-in-register.md` (CI-nn).

Disposition codes: KEEP, UPDATE, REWRITE, MERGE, ARCHIVE, DELETE, CREATE.

| File | Purpose / audience | Status and authority | Conflicts and gaps (checked against facts) | Disposition |
|---|---|---|---|---|
| `README.md` (15 lines) | Front door for visitors | Not marked; reads as current | Claims `docker-compose up` runs local development (infrastructure only; the demo needs a script, ledger D-1); claims the docs site is published (it is not, register 13); claims the roadmap and backlog are tracked on a GitHub Projects board (none exists, register 12); step 5 of the reading list is the stub `roadmap.md`. States no status, no run instructions, no evidence, no license. Priority 1 document | REWRITE (CI-18 narrative, run steps, evidence links, honest status) |
| `local-demo-execution-plan.md` (107, repo root) | Plan to reach the local demo through milestones M1 to M4, with checkboxes | "Status as of 2026-09-16"; says checkboxes mean built and verified | **Added late: missed in the first root read.** Checkboxes show unbuilt items that are built (DEV-002, DEV-004, CAT-001, ORD-001/002/003/005/006, WEB items); its M3 note says re-sequencing waits on `WI-PORT-006` pass 2; its notes on trust in done items (adapter tests fall back to fakes) are still true. A fifth overlapping milestone tracker (see `20-product.md`, Part C finding 1), at the repo root beside the README | ARCHIVE or MERGE into one demo-milestone table (with `LOCAL-MILESTONES.md`) |
| `portfolio-plan.md` (163) | Scope, MVP line, artifacts by role, sequence | Planning source; treated as authoritative scope | Lists `.github/workflows` (CI is Azure Pipelines); `web-admin`, `web-queue-display` as repo structure (empty); artifacts promised and absent: RACI, hiring plan, competitive scan, monetization, prioritization, sprint plan, dependency and versioning policy, feature-flag pattern, preview environment; Quality/Test role absent (CI-12); asks for the board and docs site (not done); no audience wording present here | UPDATE (status column per artifact; fix structure) |
| `CLAUDE.md` (90) | Instructions to AI sessions; also tells the reader how the repo works | Authoritative for sessions; **edits need the lead's approval** | See next table: 8 stale claims | UPDATE after approval |
| `.claude/CLAUDE.md` (0 lines) | none | Tracked, empty | Stray empty file; real file is the root `CLAUDE.md` | DELETE (with approval) |
| `.claude/settings.json` | Permission denies | Current | Only denies reads of `dist/`, `build/`, `*.generated.*`, `vendor/`; consistent with `CLAUDE.md` | KEEP |
| `mkdocs.yml` | Docs site navigation | Never built (mkdocs not installed) | Nav omits `process/quality-gates.md`, `operations/local-dev.md`, all of `evidence/`, `governance/*` added this pass, `management/slice-1` is present; `portfolio-plan.md` and `README.md` live outside `docs_dir` so links to them break in a built site; no `edit_uri`/`repo_url`; no plugins for Mermaid although diagrams are Mermaid | UPDATE |
| `docs/index.md` (3) | Docs-site home | Stub | Two lines; says nothing about what exists | REWRITE |
| `docs/project-log.md` (120) | Artifact index, "start here" per `CLAUDE.md` | Says it is a snapshot; "trust the repo" | Stale in many rows (register 83): services, tests and CI "Not started"; compose "Stub"; `tools/*` "Scaffolded, empty"; ADR table stops at 0010 ("All ten"); project plan "In Review"; backlog "33 epics, Batch 1 pending review"; roadmap row misdescribes. Cross-reference column and lines 3, 40, 74, 78 cite the peer repos, which breaks the no-reference decision | REWRITE as the artifact index it claims to be (or MERGE with `docs/product/backlog` outline into one status source) |
| `docs/history/ACTIVITY-LOG.md` (391) | Chronological record, newest first | Paused for new entries since 2026-10-28 (register 50); history must not be edited | Rich history that shows method (incidents, decisions, reconciliations). Gaps: nothing after 2026-10-28 (slice 1 is only in commits and `docs/evidence/`); separators `---` missing between four consecutive 2026-10-28 entries (lines 49, 52, 59); entries say "PR pending", "branch ..." that are long merged; names the peer repos and a `worklog-2026-09-07.md` that does not exist in the repo | KEEP as history (add a header note: closed 2026-10-28, successor is commit messages and evidence); fix missing separators only if the lead allows touching history |
| `apps/web-customer/README.md` (51) | Run, test and explain the web app | Mixed: lines 3-5 stale, the rest current | Status line says "WI-PORT-001 proof only ... no auth, cart, checkout or real BFF" while the sections below describe login, cart, checkout, status; run commands omit `npm run test:unit` and `npm run test:skeleton`; correct otherwise (PKCE, token in memory, cart in `sessionStorage`, logout reload) | UPDATE (status line, commands) |
| `apps/web-admin/README.md`, `apps/web-queue-display/README.md` | Placeholder | "Scaffold only" (true) | Accurate for both | KEEP (revisit when built) |
| `services/catalog-service/README.md` (39) | Endpoints, behavior, config | Header says "WI-CAT-001 implemented" | Endpoint table has 4 of 8 endpoints (missing stock adjust, reserve, release, health); no stock fields; says "Auth default provisional until WI-DEV-002 decides where the mock issuer runs" (decided and built 2026-10-26); "there is no outbox" is still true for catalog (register 30) | UPDATE |
| `services/ordering-service/README.md` (5) | Placeholder | "Scaffold only" | **False.** The most developed service (337 tests): checkout, idempotency, pickup windows, outbox, vendor actions, auto-confirm, order persistence | REWRITE (priority 1) |
| `services/admin-service/README.md`, `notification-service/README.md` | Placeholder | "Scaffold only" (true) | Accurate | KEEP |
| `services/graphql-bff/` | none | no README | Commands and env vars live only in `CLAUDE.md` | CREATE |
| `tools/` | none | no README; `tools/event-schemas`, `tools/logging-helper` are folders holding only a README | The real libraries are `BakeryMarketplace.EventSchemas` and `.Logging`; the two folders are leftovers of the original plan | CREATE `tools/README.md`; DELETE the two empty folders |
| `infra/README.md` (3) | Placeholder | "TODO" | Does not describe the one Terraform module, three environment folders, collector configs, or `infra/local` | UPDATE |

## `CLAUDE.md` claims against the facts sheet

| Claim in `CLAUDE.md` | Fact | Verdict |
|---|---|---|
| ordering-service has the `Order` aggregate, persistence, checkout and `GET /orders/{id}`; "no events are published yet" | Events publish through an outbox (`ORD-005`); vendor actions (`ORD-007`), pickup windows, auto-confirm (`ORD-008`) exist | Stale |
| The only frontend code is the `WI-PORT-001` proof | Full slice-1 customer app (login, browse, cart, checkout, status) | Stale |
| ADRs are 0001 to 0016 | 0001 to 0018 | Stale |
| catalog-service test project: "28 tests" | 104 passed (RUN) | Stale |
| Root solution contains "the catalog-service test project" | Contains both the catalog and ordering test projects | Stale |
| Root solution: "7 tools libraries" | 9 tools projects (including `MockOidcHost` and `Seed`) | Stale |
| "The existing `CorrelationIdMiddleware` still trusts an inbound header; changing that is `WI-PORT-005`" | Code never adopts it (done 2026-10-28) | **False** |
| "Target shape ... not yet built" (Next.js, BFF, Relay) | Built and verified locally | Stale |
| BFF "75 tests"; web unit "53 tests" | 75 and 53 passed (RUN) | Correct |
| Cosmos adapter tests "skip silently by default and fail against the real emulator (open item #31)" | Not re-checked this pass | Unverified |
| `azure-pipelines.yml` ran green, `ubuntu-26.04` not verified | Reported by the lead; pinned to `ubuntu-24.04` per activity log | Consistent |

## Cross-checks done in this record
- CI-18 / CI-39 (case study): the README is where the as-used narrative must link; none exists yet.
- CI-33 (conventions file): `CLAUDE.md` is the realized instance; the claims table above is the update list (needs approval).
- CI-X1: `.claude/CLAUDE.md` confirmed empty and tracked.
- Public readiness: some material was removed from the repo's docs on 2026-10-27 but remains in earlier commits (register item 93); content this pass briefly held was redacted on 2026-10-29 and the local commits rewritten before any push.

## Open decisions raised by this record
1. May `CLAUDE.md` be corrected (the table above)? It is the instruction file, so it needs the lead's approval.
2. Should `project-log.md` stay as a separate index, or become the single status source merged with the outline's On Deck (ledger P-12)?
3. ACTIVITY-LOG: leave history untouched and add only a closing note, or also fix the three missing separators?
