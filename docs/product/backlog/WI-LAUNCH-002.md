> **Status:** Proposed · decision: write it from a real recorded episode, or stage a drill first

```
WI ID:               LAUNCH-002
Title:                Blameless postmortem
Type:                 Document/Artifact
Epic:                 EPIC-GOLIVE-SUPPORT
Shared with epic(s):  none
Hat/Owner:            Operations
Status:               Proposed
Size:                 S
```

> Created 2026-10-30 from a title-only entry in the epic catalog, so the item shows up in `STATUS.md`. Created from the title-only entry "Postmortem from the above drill" (`LAUNCH-001`).

**Context / Why**
A postmortem shows how a failure is analysed without blame. A real record already exists: ten test-failure episodes between 2026-10-26 and 2026-10-29, seven found only on a clean agent (`docs/evidence/test-reliability/findings.md`). One of them, or the cold-start finding, can be written up in postmortem form now instead of waiting for a staged drill.

**Inputs / References**
- *Evidence*: `docs/evidence/test-reliability/findings.md`, `docs/evidence/slice-1/findings.md`
- *Operations*: `docs/operations/postmortems/README.md`

**You do not need to know about**
- Anything outside the chosen episode.

**Out of scope**
- Staging an incident (`LAUNCH-001`).

**Requirements / Acceptance Criteria**
- A postmortem template in `docs/operations/postmortems/`: summary, impact, timeline, root cause, what went well, what did not, actions with owners.
- One postmortem for a real episode, using only facts in the evidence and commits; each action either done (with a pointer) or recorded in the register.

**Dependencies**
- Related: `LAUNCH-001`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes for drafting; facts must come from the cited records.

**Open Points (working)**
- [ ] Which episode (the Azure-only failures as a group, or the cold-start latency).
