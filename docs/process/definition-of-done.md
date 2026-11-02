# Definition of Done

> **Status:** Current · additions proposed 2026-11-02 (register item 130), marked *(proposed)*, until the lead adopts them. What each class of change must show is in [`verification-policy.md`](verification-policy.md).

Applies to every work item regardless of Type, in addition to any item-specific addition stated in the work item itself.

- [ ] All stated Acceptance Criteria are met and verifiable (not just "looks right")
- [ ] Tests exist appropriate to the item's Type — contract tests for Interface/Contract items, unit tests with fakes for Service Implementation items, the specified chaos scenarios actually exercised for Test/Mock/Chaos items
- [ ] No secret values, connection strings, or credentials appear in code, config, or the item itself (see ADR-0007)
- [ ] Docs/artifacts affected by this item are updated in the same change — a work item that changes behavior without updating the doc that describes it isn't done, it's half done
- [ ] The spec's status banner is updated and `node scripts/docs/status.mjs` has been run, so `STATUS.md` matches
- [ ] Reviewed by someone other than the item's author/agent (or, for solo/AI-assisted work, reviewed in a separate pass rather than accepted on first draft)
- [ ] Any item explicitly blocked on this one (see its Dependencies field) is unblocked — check the backlog, not just this item, before closing it out
- [ ] *(proposed)* The spec's "ADRs and NFRs affected" line is filled in, and each ADR or NFR it names has a dated note or an edit in the same change (NFR 3.3 went stale for days because no item listed it)
- [ ] *(proposed)* The checks for the item's verification class (V0 to V3, and J) in [`verification-policy.md`](verification-policy.md) section 2 are done, or the outcome note says which were not and why
- [ ] *(proposed)* Network-facing code: the limits checklist (size, count, time, rate, per caller, cleanup, failure mode) is filled in with a test for each
- [ ] *(proposed)* A test that guards a security property was shown to fail with the property taken out, and the outcome note says how
- [ ] *(proposed)* A new dependency has a review record (maintainer, size, license, advisories, what it parses, how it is pinned)
- [ ] *(proposed)* A cross-service feature has an evidence run on the real stack that states its starting state, the commit, the command and the date
- [ ] *(proposed)* For an item that touches auth or holds connections, the adversarial review pass was done before the sensitive part was built and again before "In review"
