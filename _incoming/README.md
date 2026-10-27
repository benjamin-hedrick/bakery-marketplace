# Portfolio planning packet — revised for repository reconciliation and delegation

This is a **draft artifact packet**, not a commit and not a set of already-approved implementation changes. Review and adopt decisions individually; preserve the existing repository as the system of record.

## Important corrections in this revision

- The original generic `WI-001`–`WI-005` labels were unsafe to import into the existing backlog. This revision uses the project-specific `WI-PORT-001`–`WI-PORT-008` namespace. Check for conflicts one last time against the live branch before committing.
- The repository already has detailed domain models, context maps, service maps, C# endpoint proposals, backlog items, cache work and delegation packets. Reuse and reconcile them; don't start from blank-page designs.
- `WI-PORT-006` is an explicit, trackable reconciliation work item. The register is the checklist; the work item is the accountable task to complete and verify it.
- `WI-PORT-007` defines the first-slice contract and mapping work, grounded in existing model docs.
- `plans/07-shared-file-ownership-and-coordination.md` defines what a single owner means and how shared-file changes are coordinated.

## Suggested sequence

1. Human lead reviews proposed ADRs and the initial register. Mark accepted/rejected/deferred; do not equate draft existence with approval.
2. Start `WI-PORT-006` reconciliation planning. It may run in parallel with the isolated `WI-PORT-001` SSR/Relay proof because that proof should not touch central docs or domain contracts.
3. Complete `WI-PORT-007` contract/model mapping before broad frontend and service implementation delegation.
4. Assign named owners for shared schema, lockfile/root config, service contracts, pipeline YAML, and central docs using the ownership plan.
5. Only then launch the walking skeleton and quality/telemetry tasks in parallel where their file scopes do not conflict.

## Existing repo material to inspect

Start with `docs/architecture/data-model-api-contracts.md`, `docs/architecture/ddd/glossary.md`, `docs/architecture/ddd/event-storming.md`, `docs/architecture/ddd/bounded-contexts.md`, `docs/architecture/c4/container.md`, `docs/architecture/capability-map.md`, ADR-0002, ADR-0008, ADR-0009, ADR-0010, ADR-0011, the relevant `WI-CAT-*`, `WI-ORD-*`, `WI-DEV-*`, `WI-WEB-*`, `WI-CACHE-*` backlog files, and their existing delegation packets.

## Contents

- `decisions/` — proposed ADR drafts for SSR/Relay, BFF, cache layers, OpenTelemetry, and Azure DevOps CI/CD.
- `plans/01-reconciliation-register.md` — file-by-file initial reconciliation inventory.
- `plans/07-shared-file-ownership-and-coordination.md` — ownership and integration rules.
- `plans/08-existing-models-and-maps-inventory.md` — model/map reuse inventory.
- `work-items/WI-PORT-001`–`WI-PORT-005` — bounded technical proofs and implementation tasks.
- `work-items/WI-PORT-006` — reconciliation task.
- `work-items/WI-PORT-007` — first-slice API/model mapping task.

## Guardrails

- No repository files are modified by creating this packet.
- Don't claim a scaffold, endpoint, pipeline or cloud deployment is operational until commands/evidence prove it.
- C# services remain authoritative for domain rules and persistence; GraphQL is a composition contract, not a second domain model.
- Do not delete the GitHub Actions placeholder until Azure DevOps checks are proven and required checks have migrated.
- Each work item requires one accountable owner, explicit allowed files, objective acceptance criteria, required evidence, and a handoff.
