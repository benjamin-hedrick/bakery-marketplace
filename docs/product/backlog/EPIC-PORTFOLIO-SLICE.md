```
Epic ID:            EPIC-PORTFOLIO-SLICE
Title:               Portfolio vertical slice — Next.js SSR → GraphQL BFF → C# services, with CI, tracing and test evidence
Scope:               cross-cutting (Catalog, Ordering, web-customer, delivery infrastructure, observability)
Primary hat(s):      Architect, Engineering/Build, Platform Engineering
Goal:                Prove one production-shaped browse-to-order slice end to end (SSR + Relay handoff, BFF composition
                     without domain ownership, explicit cache behavior, a trace across available hops, Azure Pipelines
                     gates, deterministic tests), with evidence linked to real commits, test output and traces.
Related references:  ADR-0012 to ADR-0016; docs/management/portfolio-slice/ (implementation plans);
                     docs/product/backlog/worklog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md
Constituent work items:
  - WI-PORT-001 (Test/Mock/Chaos — Next.js Pages Router + Relay SSR proof) — Done 2026-10-26; proceed, in-repo Relay pattern (relay-nextjs rejected)
  - WI-PORT-002 (Integration — walking skeleton, one listing read path) — Ready; CAT-001 and PORT-001 done. Open: seeding for the first end-to-end run (DEV-004 needs DEV-002)
  - WI-PORT-003 (Infra/Environment — quality + Azure Pipelines CI baseline) — Ready; supersedes CI-001
  - WI-PORT-004 (Interface/Contract — cache contract for the listing path, three layers) — blocked by PORT-002
  - WI-PORT-005 (Integration — trace propagation + safe logs) — blocked by PORT-002; supersedes OBS-002
  - WI-PORT-006 (Document/Artifact — reconcile existing artifacts) — In Progress (pass 1 done 2026-10-26)
  - WI-PORT-007 (Interface/Contract — first-slice contract + GraphQL mapping) — In Progress (draft; D-1 to D-4 accepted); prerequisite to broad delegation
Status:              Started (7 of 7 items detailed; 1 in progress)
```

**Sequence** (from `docs/management/portfolio-slice/05-agent-rules-and-sequence.md`): `PORT-006` and `PORT-001` can run in parallel → `PORT-007` must complete before broad frontend/service delegation → assign shared-file owners (`07-shared-file-ownership-and-coordination.md`) → `PORT-002` → `PORT-003`/`PORT-004`/`PORT-005` in parallel where their file scopes don't conflict.

**Relationship to existing backlog**: this epic doesn't replace Batch 4 (`CAT-001`, `ORD-001`–`006`, `CAT-003`, `QUE-001`) or `EPIC-WEB-CUSTOMER`. `PORT-007` maps the GraphQL contract onto those items, and `PORT-002` uses `CAT-001`'s listing read contract. Items this epic supersedes or adjusts carry a dated reconciliation note and are listed in the 2026-10-26 dispositions record.
