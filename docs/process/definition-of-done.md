# Definition of Done

Applies to every work item regardless of Type, in addition to any item-specific addition stated in the work item itself.

- [ ] All stated Acceptance Criteria are met and verifiable (not just "looks right")
- [ ] Tests exist appropriate to the item's Type — contract tests for Interface/Contract items, unit tests with fakes for Service Implementation items, the specified chaos scenarios actually exercised for Test/Mock/Chaos items
- [ ] No secret values, connection strings, or credentials appear in code, config, or the item itself (see ADR-0007)
- [ ] Docs/artifacts affected by this item are updated in the same change — a work item that changes behavior without updating the doc that describes it isn't done, it's half done
- [ ] `docs/project-log.md` status updated if this item completes or changes the status of a tracked artifact
- [ ] Reviewed by someone other than the item's author/agent (or, for solo/AI-assisted work, reviewed in a separate pass rather than accepted on first draft)
- [ ] Any item explicitly blocked on this one (see its Dependencies field) is unblocked — check the backlog, not just this item, before closing it out
