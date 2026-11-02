# Definition of Ready

> **Status:** Current · rewritten 2026-10-30

The Definition of Ready is the context-completeness check for delegated work (`docs/method/glossary.md`): before an item is handed to a person or an agent, it must carry what that person or agent needs, because a delegate with less repository access or less ability to plan cannot fill the gaps. A work item is Ready (status `Ready`, see `docs/method/status-and-supersession.md`) when every core field in `docs/method/work-item-template.md` is populated, not just present but filled in with real content:

- [ ] Title, Type, Epic and Hat/Owner are set, and the banner on line 1 says `Ready`
- [ ] Context/Why references a specific decision (an ADR, a vision principle, or a prior work item), not a vague restatement of the epic
- [ ] Inputs/References is a bounded list (aim for 3 to 5), grouped as Decisions, Interfaces, Environment/tooling, Test/chaos methodology and Business context. If it is longer, split the item before it is marked Ready, not after work starts
- [ ] "You do not need to know about" and "Out of scope" are stated, not left blank, and name the item that does the excluded work
- [ ] Requirements/Acceptance Criteria are concrete and testable: a reviewer can check each one off objectively, not judge it subjectively
- [ ] Dependencies (blocks, blocked by, parallel with) are identified against the current backlog (`docs/product/backlog/STATUS.md`)
- [ ] The type-specific section (interface signature, events published or consumed, data touched) is filled in for whichever Type applies
- [ ] AI-agent suitability is stated, with a reason if Partial or No, and any decision an agent must flag instead of choosing is named
- [ ] Open points are listed with who decides; none of them blocks the first step
- [ ] If the work touches security, auth logic, IAM/RBAC, or expands the scope of another item, the human approval it needs is named (`CLAUDE.md`, "Human approval required")
- [ ] *(proposed, register item 130)* The "Verification class" (V0 to V3, J) and the "ADRs and NFRs affected" line are filled in
- [ ] *(proposed)* For anything that holds a connection or a resource, or parses outside input (class V3), the abuse cases are acceptance criteria: a slow client, many clients, a large input, a client that never reads, cleanup when the client leaves, many requests from one caller

An item that is missing any of the above is not Ready yet. Send it back for another pass rather than starting work against gaps that will surface mid-task instead.
