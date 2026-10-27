# Reconciliation Dispositions — 2026-10-26

**Status:** Official reconciliation record  
**Authority:** Human project lead (decisions approved 2026-10-26); Bakery Marketplace repo agent (integration)  
**Source:** Portfolio planning packet (staged in `_incoming/`, transient) and repository verification against baseline commit `72be4f8`  
**Tracking item:** `WI-PORT-006` (this record is its pass 1)

This document records the dispositions for adopting the portfolio planning packet. Following the 2026-10-25 convention, historical work-item specs are not rewritten: each affected item gets a dated reconciliation note at the top, and a matching marker in `MASTER-BACKLOG-OUTLINE.md`.

---

## A. Decision dispositions

| # | Packet proposal | Conflicted with | Disposition | Recorded as |
|---|---|---|---|---|
| **A1** | Next.js Pages Router + SSR | ADR-0011 (Accepted: React/Vite SPA, Static Web Apps, SSR "not seriously considered") | **Accepted; supersedes ADR-0011.** SSR for public listing pages only; authenticated pages render client-side, so ADR-0006's token posture is unchanged. Hosting left open (open item #25). | ADR-0012; ADR-0011 status + supersession note |
| **A2** | Standalone Node/TS GraphQL BFF + Relay | ADR-0008 (APIM as the single frontend entry point; BFF was considered and not chosen) | **Accepted; amends ADR-0008.** BFF is the browser's single entry point; APIM is retained in front of service APIs (BFF → APIM → services in the cloud, direct locally). Zero-trust dual validation unchanged. | ADR-0013; ADR-0008 amendment note |
| **A3** | Three cache layers; draft rejected "one generic abstraction" and "immediate Redis" | ADR-0002 (Accepted) **and built code** (`CACHE-001`–`004` Done) | **Accepted as an extension, not a replacement.** ADR-0002 is layer 1, unchanged. Layers 2 (Relay) and 3 (HTTP/CDN) are added, with per-cache contract fields. The draft's "no server cache by default" was dropped. | ADR-0014; ADR-0002 amendment note |
| **A4** | Azure DevOps Pipelines as CI/CD system of record | `tech-stack.md` (GitHub Actions, Confirmed); ADR-0007 (Stripe test keys in GitHub Actions secrets) | **Accepted; amends ADR-0007.** Workload identity federation; secrets via pipeline secret variables or a Key Vault-linked variable group. `ci.yml` stays until the exit criteria are met. | ADR-0015; ADR-0007 amendment note |
| **A5** | OpenTelemetry + W3C Trace Context | `tech-stack.md` (Application Insights); `WI-TOOL-002` custom `X-Correlation-Id` | **Accepted, with an explicit trace approach**: `traceparent` is the only propagated mechanism; `X-Correlation-Id` becomes a response-only alias of the trace ID; no inbound adoption; envelope gains `traceparent` with span links; Application Insights stays as the cloud backend. | ADR-0016 |

## B. Packet defects fixed on import

| # | Defect | Fix |
|---|---|---|
| **B1** | Packet README claimed an eight-item `WI-PORT` range; only 001–007 exist | Range stated as 001–007 everywhere persisted; the packet README was not imported (it is transient) |
| **B2** | ADR drafts unnumbered | Numbered 0012–0016 (0011 already exists) |
| **B3** | `WI-PORT-006` / plan 01 proposed a new register parallel to the existing reconciliation process | `WI-PORT-006` now uses this dispositions format; plan 01's rows were merged into `WI-PORT-006`'s pass-2 register; plan 01 was not imported separately |
| **B4** | Plan 04's "evidence ledger" duplicated `docs/ACTIVITY-LOG.md` | Plan amended: evidence entries go in `ACTIVITY-LOG.md` |
| **B5** | Cache plan/`WI-PORT-004` said "default to no server-side cache" | Amended to retain ADR-0002/`WI-CAT-003` as layer 1 (consistent with A3) |
| **B6** | Draft ADR text said ADR-0011 "reportedly" chose Vite | Verified and stated as fact in ADR-0012 |
| **B7** | Work items lacked the repo's standard header block | Header blocks added (ID, type, epic, shared epics, owner, status, size) |

Imported to: `docs/architecture/adr/0012`–`0016`, `docs/product/backlog/WI-PORT-001`–`007.md`, `docs/product/backlog/EPIC-PORTFOLIO-SLICE.md`, `docs/management/portfolio-slice/` (plans 00, 02–08 plus a README). `mkdocs.yml` nav updated.

## C. Existing backlog dispositions

Items are kept. Detailed items carry a dated note; title-only items are marked in `MASTER-BACKLOG-OUTLINE.md`.

| Item | Disposition | Summary |
|---|---|---|
| `WI-WEB-001` | **Superseded** | By `WI-PORT-001`/`002`. PKCE, in-memory token, no refresh, and auth-fetch wrapper carry forward. |
| `WI-CUST-002` | **Adjusted** | SSR page via BFF/Relay; blocked by `PORT-002`/`PORT-007` instead of `WEB-001` |
| `WI-CUST-003` | **Adjusted** | Client-rendered; GraphQL mutation per `PORT-007`; server revalidation |
| `WI-CUST-004` | **Adjusted** | Client-rendered via BFF; `private, no-store` |
| `WI-CUST-005` | **Adjusted** | Client-rendered via BFF; dietary data never logged or shared-cached |
| `WI-CUST-006` | **Adjusted** | Via BFF; personalized responses not shared-cached |
| `WI-QUE-002` | **Adjusted** | Next.js (client-rendered, polling via Relay refetch) via BFF |
| `WI-CAT-003` | **Adjusted (minor)** | Retained as layer 1; record ADR-0014 per-cache fields |
| `WI-TOOL-002` | **Adjusted (follow-up change)** | ID source becomes the trace ID; code change in `PORT-005` |
| `WI-EVT-001` | **Adjusted (follow-up change)** | Envelope gains `traceparent`; change in `PORT-005` |
| `WI-CAT-001` | **Adjusted** | Anonymous reads of `Published` listings (D-4); money as integer cents (D-1) — first-slice contract |
| `WI-ORD-001` | **Adjusted** | No cart endpoint in the first slice (D-2); checkout takes line items; server-side pricing in cents |
| `WI-ORD-003` | **Adjusted** | Adds simple generated pickup-window source (D-3); capacity/per-vendor hours deferred |
| `WI-DEV-002` | **Adjusted** | Compose adds the Next.js app(s), BFF and trace viewer; no APIM stand-in |
| `EPIC-WEB-CUSTOMER`, `EPIC-CACHING` | **Adjusted (epic notes)** | References updated; constituent items retained |
| `CI-001` | **Superseded** | By `WI-PORT-003` |
| `CI-002`, `CI-003` | **Adjusted** | Azure Pipelines / workload identity federation |
| `CI-004` | **New** | Migration cut-over that removes `ci.yml` |
| `OBS-001` | **Adjusted** | OpenTelemetry SDK + Azure Monitor exporter, including Next.js/BFF |
| `OBS-002` | **Superseded** | By `WI-PORT-005` (W3C Trace Context) |
| `GW-003` | **Adjusted** | Runs in Azure Pipelines |
| `GW-005` | **Obsolete (cancelled)** | Browser no longer calls APIM; URL-parity stand-in has no purpose |
| `INFRA-002` | **Adjusted** | Static Web Apps no longer fits; Node-capable host (open item #25) |
| `REPO-001` | **Adjusted** | Publish step not via GitHub Actions |
| Batch 4 (`CAT-001`, `ORD-001`–`006`, `QUE-001`), `DEV-004`, `AUTH-005`, `CACHE-*`, `GW-001/002/004/006` | **Retained** | `PORT-007` maps the GraphQL contract onto them; `PORT-002` reuses `CAT-001`'s read contract and `DEV-004`'s seed mechanism |
| `PARKING-LOT.md` frontend entries (refresh token, shared package) | **Retained** | Still valid under ADR-0012 |

## D. Other documents updated in this pass

`docs/architecture/tech-stack.md` (frontend framework/hosting, BFF, observability, source control, CI/CD, local-dev rows); `docs/architecture/adr/README.md` (adds 0012–0016, lists 0011 as superseded, and fixes the pre-existing omission of 0011 from the index); `docs/governance/open-items-register.md` (#14, #20, #24 annotated; #25–#27 added); `LOCAL-MILESTONES.md` and `local-demo-execution-plan.md` (M3 notes only).

## E. Deferred to `WI-PORT-006` pass 2

C4 diagrams, `data-model-api-contracts.md` (GraphQL mapping section, after `WI-PORT-007`), `nfrs.md` (BFF latency budget), process docs (DoR/DoD evidence and trace requirements), `project-plan.md` / `roadmap.md` / `portfolio-plan.md` / full milestone re-sequencing, `budget-cost-estimate.md` (after hosting is decided), `docs/index.md` / root `README.md` / `project-log.md`. Owner: the `WI-PORT-006` integrator. Trigger: `WI-PORT-007` complete (for the contracts and diagrams), `INFRA-002` (for cost).

## F. Noted, not acted on

- `open-items-register.md` #11 says the tooling packages aren't built, but `tools/` shows most of them are. This is pre-existing drift, outside this pass.
- `WI-*.md` header `Status:` fields remain stale relative to `MASTER-BACKLOG-OUTLINE.md` (e.g. `WI-TOOL-002` says Ready but is Done). Per convention, the master outline is authoritative for status.
