# Review record: `docs/architecture` (2026-10-29)

> **Status:** Historical · moved 2026-10-30 from `docs/governance/`. A working record of the October 2026 documentation review. Its findings are dispositioned in [`closing-record.md`](closing-record.md) and the live gap catalog (`docs/product/backlog/gap-catalog/`). The text is unchanged except that the names of three other repositories are replaced by labels (peer-A: a process framework; peer-B: an AI collaboration playbook; peer-C: an older playbook) and that references to files that moved were re-pointed. Relative links in it no longer work.

Read in full this pass (all 25 Markdown files, 2,349 lines): `adr/README.md`, ADRs 0001 to 0018, `adr/template.md` and `adr/0000-template.md`, `c4/README.md`, `c4/context.md`, `c4/container.md`, `capability-map.md`, `ddd/README.md`, `ddd/bounded-contexts.md`, `ddd/glossary.md`, `ddd/event-storming.md`, `data-model-api-contracts.md`, `first-slice-contract.md`, `nfrs.md`, `order-lifecycle.md`, `tech-stack.md`. Checked against `docs/evidence/facts-sheet-2026-10-29.md`. This record replaces the earlier sampled findings A-1 to A-9 in the ledger (those stand, corrected below). Peer items refer to `peer-copy-in-register.md`.

## Overall judgement

The ADR set is the strongest asset in the repo: 18 records, one decision each, alternatives and consequences stated, amendments appended as dated notes, one supersession with the status kept. The weakness is **status lines and the documents around the ADRs, not the decisions**: four accepted ADRs still say "validation pending" after validation, ADR-0017's status line is out of date, the C4 diagrams and NFRs describe the pre-BFF, pre-Entra system, and `tech-stack.md` closes with "no other open decisions" and "next steps move into backlog".

## ADRs

| ADR | Status line says | Reality | Conflicts and gaps | Disposition |
|---|---|---|---|---|
| 0001 fulfillment seam | Accepted | Seam built (`FulfillmentContracts`, events); `PickupFulfillment` (`ORD-003`) only partly built | Decision says v1 "implements exactly one strategy" with `OrderReadyForPickup` raised by it; the strategy and its events are not built, the Order complete path is a direct vendor command | KEEP; add dated status note |
| 0002 cache | Accepted, extended by 0014 | `ICacheProvider`, Redis/local/resilient/chaos built and tested (214 tools tests incl. caching); **no catalog cache-aside wired** (`CAT-003` unbuilt) | Terraform snippet (`enable_managed_redis`) is not in `infra/` (only `key_vault`); "LRU map" vs `IMemoryCache`; says dev default has no Redis container (compose default matches). Cache is a library, not yet a used layer: material for goal B | KEEP; note what is wired |
| 0003 events | Accepted | Redis Streams transport built; outbox in ordering; Event Grid not built; `ChaosEventTransport` not built (`EVT-004` ⚪) | Says the envelope lives in `/tools/event-schemas` (it is `BakeryMarketplace.EventSchemas`); dead-letter "reachable" claim vs known gap B2 (deserialization failures are acked without dead-lettering); decision text names no outbox though the outbox is the central pattern now | KEEP; amendment note: outbox, B2 |
| 0004 data | Accepted | Cosmos repository built, vNext emulator used | Calls the emulator "Linux ... partial API coverage" (compose uses vNext); `order-status-readmodel`, `vendors`, `preferences`, `reviews`, `payouts` containers not built; reserved partition and reservation records share `catalog` (not in the ADR; register 66) | KEEP; amendment note |
| 0005 payments | Accepted | Stub payment only | Consistent; Stripe not built; SAQ A claim untested | KEEP |
| 0006 auth | Accepted | Mock issuer + middleware built; Entra not | **Decision text still says Azure AD B2C**, amendment notes below say Entra; a section "Open item surfaced, not resolved here" (secrets) was resolved by ADR-0007; lists `web-admin` as a client (does not exist); `/tools/auth-middleware` is `BakeryMarketplace.Auth` | KEEP; add a one-line "current reading" note at the top |
| 0007 secrets | Accepted, amended by 0015 | Key Vault Terraform module exists, never planned or applied; no managed-identity Cosmos access yet | Body is about GitHub Actions (amended); `SecretValidator` exists | KEEP |
| 0008 gateway | Accepted, amended by 0013 | APIM not built | Body still describes three frontends calling APIM; amendment covers it | KEEP |
| 0009 mapping | Accepted | Mapping holds (admin and notification empty) | **Last "Related" bullet cites the peer framework repo** | EDIT that bullet (no body change) |
| 0010 language | Accepted | `net10.0` everywhere | Status line does not say amended (index does); decision text says .NET 8; lists libraries (`Azure.Messaging.EventGrid`, Key Vault SDK) not yet used | KEEP; status line "Accepted, amended 2026-10-28" |
| 0011 | Superseded | Superseded | Correct | KEEP |
| 0012 Next.js | "Integration validation pending PORT-001" | Validated (own section at the bottom) | Header stale | Status note |
| 0013 BFF | "Validation pending PORT-002" | Validated in slice 1 | Header stale; its consequences ask for a latency budget "once measured": slice evidence has numbers (cold first checkout about 4.7 s, warm 55 to 78 ms through BFF, ordering, catalog) | Status note; use evidence |
| 0014 cache layers | Accepted | Layer 1 library built; layers 2 and 3 documented, **no per-cache contract** (`PORT-004` unbuilt) | The "every cache entry records owner, key, freshness..." rule has no instance yet | KEEP; build `PORT-004` |
| 0015 pipelines | "Migration in progress: GitHub Actions remains" | Migrated; amendment says `ci.yml` removed | Header contradicts its own amendment | Status note |
| 0016 tracing | "Validation pending PORT-005" | Built and evidenced; amendment on backends | Header stale; item 1 says ".NET 8" | Status note |
| 0017 stock | "(`ORD-001`) is not" built | `ORD-001` built (checkout reserves stock) | **Stale within hours of writing**; otherwise a model status line | Status note |
| 0018 service auth | Proposed; phase 1 built | Consistent | Accurate and honest; DEV credential open (register 62) | KEEP |
| `adr/README.md` | index | | Numbered list 1 to 17 does not match ADR numbers (item 11 is ADR-0012); "Amended" list omits 0010, 0016, 0017, 0018 and 0012; says `0000-template.md` was renamed but both files exist; 0006 row still "Azure AD B2C"; no status column | REWRITE with a status column |
| `adr/template.md`, `0000-template.md` | template | | Byte-identical; thinner than the ADRs (no Alternatives, Related, or "practices") | DELETE `0000-template.md`; UPDATE template (CI-13) |

## Other architecture documents

| File | Purpose | Status | Conflicts and gaps | Disposition |
|---|---|---|---|---|
| `c4/README.md` | Index | Promises `component-*.md` | None exist (`ARCH-005`) | UPDATE |
| `c4/context.md` | System context | "Done" | **Azure AD B2C** as the identity system (ADR-0006 amended to Entra); notification transport honestly omitted | UPDATE |
| `c4/container.md` | Containers | "Confirmed" | Browsers go through APIM to services (ADR-0013 made the BFF the entry); **no BFF, no Next.js server, no mock issuer, no collector**; shows `web-admin`, `web-queue-display` as real; a `CAT --> CAT` self-loop; ordering-to-catalog stock call (ADR-0017) missing; **no built/planned distinction**. Most visible gap for an architecture reader | REWRITE (built vs planned; request path; one component diagram) |
| `capability-map.md` | Business view | Done | Consistent with ADR-0009 and personas. Not a gap that it has no BFF (business-facing); my earlier note was wrong | KEEP |
| `ddd/README.md` | Index | | Lists `aggregates.md`, which does not exist | UPDATE |
| `ddd/bounded-contexts.md` | Context map | Authoritative | Consistent; "payments worth its own ADR" (done: 0005) | KEEP |
| `ddd/glossary.md` | Ubiquitous language | Current | Updated for the lifecycle (`Pending`, `OrderCustomized` unused); the long note after "Key domain events" is narrative history | KEEP; trim narrative |
| `ddd/event-storming.md` | Process flows | Flow 2 updated 2026-10-28 | Header note still says the flow includes "a response timeout" (deferred, register 55); last section **cites the peer framework repo**; flows omit stock reservation, outbox, auto-confirm | UPDATE |
| `data-model-api-contracts.md` (318) | Contracts | Mixed target and as-built | Header: all endpoints "route through APIM"; versioning note points to the (stale) parking lot; first-slice mapping and as-built notes (S1-01a/b) are accurate and detailed; per-service sections still carry the pre-slice shapes (`Order.status` without `Pending`, `OrderCustomized`, order list endpoints and `order-status-readmodel` not built, `price` naming); **no machine-readable spec** | SPLIT: as-built reference (generate OpenAPI) vs target model |
| `first-slice-contract.md` (188) | Slice-scope record | Accepted | Accurate and the best example of dated updates (implementation check, as built table). Opening status sentence ("nothing below is implemented") predates the build; section 10 "gaps" are all closed but not marked; the long file would benefit from a 10-line "final state" on top | UPDATE (status summary) |
| `nfrs.md` (67) | Non-functional requirements | "Done" | Intro still mentions "NEEDS INPUT" (resolved); 3.2 says **Azure AD B2C**; event ceiling math uses 5 events per order (`OrderCustomized` removed; the lifecycle now produces about 7 to 8); gateway ceiling counts browser calls through APIM (BFF now); **no BFF latency budget** (ADR-0013 asks for one); no entries for tracing data safety, outbox delivery, idempotency; load targets still unmeasured | UPDATE; add measured baseline |
| `order-lifecycle.md` (71) | Lifecycle design | Agreed and built | Accurate. Section header "Order action endpoints (draft...)" though built; opening says it is what `ORD-002` "implements as in-memory" (history) | UPDATE headings only |
| `tech-stack.md` (79) | Reference | "Confirmed" column | Says ADR-0001 to 0016 (0018 exist); frontend row "validation pending"; local table: Linux emulator, "seed on `docker-compose up`" (manual), "Web apps + BFF ... Compose wiring tracked in DEV-002" (not built); **CI/CD row claims workload identity federation "no stored secrets"** (nothing deployed); "Open decisions" ends "No other open architectural decisions remain ... next steps move into backlog" (false); no versions (Next 16.4.3, React 19.3, Relay 21, Node >=24, .NET 10), no testing stack | REWRITE with a Confirmed vs Built/Verified split and versions (goal B) |

## Cross-document contradictions to settle in one pass

1. **Identity provider:** ADR-0006 body, `c4/context.md`, `c4/container.md`, `nfrs.md` 3.2, ADR index, `project-log.md` say B2C; ADR-0006 amendment and `tech-stack.md` say Entra.
2. **Where the browser enters:** ADR-0008 body, `c4/container.md`, `nfrs.md` gateway line, `data-model` header (APIM) versus ADR-0013 (BFF).
3. **Order events and statuses:** `nfrs.md`, `data-model` per-service sections, `QUE-001` use `OrderCustomized`, five events, no `Pending`; glossary, lifecycle and code do not.
4. **Emulator:** ADR-0004 and `tech-stack.md` say Linux; compose and ADR evidence use vNext.
5. **Status of validation:** ADR-0012, 0013, 0015, 0016 headers versus their bodies; ADR-0017 versus `ORD-001`.
6. **Counts:** `tech-stack.md` "ADR-0001 through ADR-0016".

## Gaps against the demonstration goals and the public repo (priority order)

1. **Architecture diagrams that show the system** (container with BFF and built/planned; a request-path/sequence diagram with the trace; one component diagram, ordering-service). Highest-value artifact for the architect story. Source material exists in `first-slice-contract.md` section 2 and `docs/evidence/slice-1/findings.md`.
2. **A decision timeline** (0011 to 0012 to 0013; B2C to Entra; .NET 8 to 10; ADR-0015 soft gate; ADR-0017/0018 same-day), one page, from the dated amendments already in the ADRs. This is what an architecture reviewer wants to see.
3. **A patterns page** (CI-08): adapter + fallback + contract tests + chaos, outbox with inline publish and relay, idempotency with a spent key, reserve/release with a final released state, BFF as composition not domain, gated test hooks, clean-agent and real-stack verification. All are built and cited in ADRs; none is gathered.
4. **API specification** (A-5 stands): no OpenAPI anywhere; the BFF has a schema file, the services have none. Generate from the services or hand-write for the five public endpoints and add contract tests (goal A and 2).
5. **A measured NFR baseline** (A-8 stands): the slice evidence already has two timing numbers; a small repeatable run with recorded results would convert assumptions to evidence.
6. **Layer 2 and 3 cache contracts** (`PORT-004`) and the catalog cache-aside (`CAT-003`): goal B asks for caching/consistency trade-offs and the repo documents them but has not built the per-cache record or the cache-aside.
7. **Peer references to remove:** ADR-0009 (Related), `ddd/event-storming.md` (last section).

## Dispositions summary

KEEP: all 18 ADR decisions and bodies (history), `bounded-contexts`, `glossary`, `capability-map`, `order-lifecycle`, `first-slice-contract`. ADD dated status notes (not body edits): ADR-0001, 0002, 0003, 0004, 0006, 0010, 0012, 0013, 0015, 0016, 0017. REWRITE: `adr/README.md` (status column), `c4/container.md`, `tech-stack.md`. UPDATE: `c4/context.md`, `c4/README.md`, `ddd/README.md`, `ddd/event-storming.md`, `nfrs.md`, `first-slice-contract.md` header, `order-lifecycle.md` headings. SPLIT: `data-model-api-contracts.md`. DELETE: `adr/0000-template.md`. CREATE: decision timeline, patterns page, component diagram, request-path diagram, API spec, NFR baseline.

## Peer cross-checks done in this record
CI-08 (patterns: no single page; content present across ADRs 0001 to 0009, 0017), CI-13 (ADR template: thinner than practice; add the four working practices), CI-14 (architecture review: see governance pass), CI-09 (surprise-as-trigger visible in ADR-0009 origin and ADR-0017/0018, a good public example), CI-12 (catalog has no Quality role; NFRs have no testing/quality section).
