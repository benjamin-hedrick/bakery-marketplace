# Definition of Ready

A work item is Ready when every core field in `project-process-framework/templates/work-item-template.md` is populated — not just present, but actually filled in with real content:

- [ ] Title, Type, Epic, Hat/Owner are set
- [ ] Context/Why references a specific decision (ADR, vision principle, or prior work item) — not a vague restatement of the epic
- [ ] Inputs/References is a bounded list (aim for 3–5). If it's longer, split the item before it's marked Ready, not after work starts
- [ ] Out of scope is stated explicitly, not left blank
- [ ] Requirements/Acceptance Criteria are concrete and testable — a reviewer should be able to check each one off objectively, not judge it subjectively
- [ ] Dependencies (blocks/blocked-by/parallel-with) are identified against the rest of the current backlog
- [ ] The type-specific section (Interface signature, Events published/consumed, etc.) is filled in for whichever Type applies
- [ ] AI-agent suitability is stated, with a reason if Partial/No

An item that's missing any of the above isn't Ready yet — send it back for another pass rather than starting work against gaps that will surface mid-task instead.
