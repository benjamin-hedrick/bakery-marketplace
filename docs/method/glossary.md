# Process glossary

> **Status:** Current · defined 2026-10-30

Process terms used in this repository. Domain terms (listing, order, vendor) are in `docs/architecture/ddd/glossary.md`.

- **Work item:** one unit of work with a spec in `docs/product/backlog/WI-*.md`; each commit maps to one.
- **Epic:** a group of work items (`EPIC-*.md`); its status is a count derived from its items.
- **Slice:** a thin end-to-end path through the system; slice 1 is login, browse with stock, cart, checkout and order status.
- **Status banner:** the one-line status at the top of a spec or document (see `status-and-supersession.md`).
- **Outcome note:** a note above a built spec saying what was built, how it differs, and how it was verified.
- **Reconciliation note:** a dated note above a spec recording that it was adjusted, superseded or made obsolete, and why.
- **Reconciliation record:** a file under `docs/product/backlog/reconciliation/` listing the dispositions of one reconciliation pass.
- **Amendment note:** a dated note appended to an ADR that changes context without altering the decision text.
- **Evidence record:** a snapshot under `docs/evidence/` showing what was run and what happened; begins with a Current result line.
- **Register item:** one numbered entry in the register, with a type, source, hat and a status (Open, Tracking, Accepted, Deferred, Resolved); see `register-item-template.md`.
- **Register:** the open-items register (`docs/governance/open-items-register.md`), the running list of unreconciled findings.
- **Gate:** a check that must pass before a change moves on (tests, format, link check, pipeline).
- **Snapshot:** a document true at a stated date and not maintained afterwards.
- **Historical:** kept as a record of what was planned or done; lives in `docs/history/`.
- **Packet and wave:** September 2026 planning vocabulary for a bundle of specs handed to an agent, and a group of packets run together.
- **Hat / role:** the capacity a work item is done in (for example Engineering/Build); one person can wear several.
- **Human approval:** a decision the lead must make before work proceeds (security, auth, IAM/RBAC, scope expansion, refactoring).
- **Context completeness:** the proactive discipline of making sure whoever does a piece of work has the context to do it, before they start, so the work is self-contained and efficient: no repeated analysis, no re-evaluating decisions that were already vetted and approved, no rework. What counts as enough differs with who is doing it: their repository access, whether they are a human or an AI agent and what that agent can do, their skill, and how much of the analysis and planning is theirs to do. It applies at every step of plan, delegate, implement, review and refine. In this repository it shows up as the bounded, categorized References and the "you do not need to know about" section of a work item, the Definition of Ready, the onboarding path, and exercises such as event storming that surface unstated assumptions early. See [context-completeness.md](context-completeness.md).
- **Surprise rule:** the reactive counterpart, used in any step and any kind of work (chat, iterative work, delegation, coordination, review). When something unexpected shows up (a wrong assumption, a revelation, a lesson), ask whether a process, policy or artifact should have covered it, and whether anything should change to do better next time; then make the change in proportion, and record the lesson if it is worth keeping. ADR-0009 (the service mapping) and ADR-0017 (stock ownership) both started this way. See [surprise-rule.md](surprise-rule.md).
- **Parking lot:** `docs/product/backlog/PARKING-LOT.md`, transient loose ends from a session that are not yet a work item or a register item.
- **Hard invariant / guided default:** the two kinds of rule. A hard invariant has no exceptions and is paired with a check where possible; a guided default may be departed from if the departure is stated and justified. See [rule-authoring.md](rule-authoring.md).
- **Environment target / fallback chain:** the two meanings of "local fallback". The target is which implementation an environment uses, chosen at configuration time; the chain is what a running system degrades to on failure. See [patterns](../architecture/patterns.md).
- **Mutation check:** deliberately breaking code or a test to confirm the test fails when it should.
- **Clean-agent verification:** running the documented commands from a fresh clone or fresh agent session, to prove the documentation is sufficient.
- **Real-stack journey:** an end-to-end test against the running local stack (Compose infrastructure plus real services), not mocks.
