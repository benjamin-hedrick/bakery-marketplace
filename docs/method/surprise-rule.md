# The surprise rule

> **Status:** Current · revised 2026-10-30. The reactive half of two ideas; the proactive half is [context completeness](context-completeness.md).

A **surprise** is any moment when something unexpected shows up: a wrong assumption, a revelation, a result nobody predicted, a lesson learned the hard way. It can happen in any step (plan, delegate, implement, review, refine) and in any kind of work: an interactive chat, iterative work, a delegated task, coordination between sessions, a document review, a failed pipeline.

**The rule:** when it happens, do not just fix the immediate thing and move on. Ask two questions.

1. **Should a process, a policy or an artifact have covered this?** If so, which one, and does it need adding or fixing? If it was covered but not followed or not found, that is a different lesson: why was it missed?
2. **Should we adjust anything to do better next time?** The process, a policy, an artifact, how work is briefed, a check, the tooling, or how we work in a session. Or nothing: some surprises are accepted, with the reason noted.

Fixing the instance is always done. Adjusting the way of working is done in proportion to what the surprise showed. Then the lesson is recorded where it will be found: see [the lessons record](lessons.md) for the ones worth keeping.

Context completeness tries to prevent surprises. The rule exists because some of them can only be seen afterwards, and because a reliable response matters more than trying to think of everything in advance.

## The outcome is not always an artifact

| Kind of outcome | Example from this repository |
|---|---|
| A decision record | The service mapping, found by drawing a diagram (ADR-0009) |
| A note on a decision, or a rewritten spec | The zero-trust posture added to ADR-0008 and ADR-0006; several specs rewritten to match the build |
| A register item for something found and not fixed | Events dropped when they cannot be read (register 88) |
| A new check or gate | The Linux container run and the Redis command-count check, after tests passed here and failed on a clean agent |
| A change to how we work | Do not push a fix per failing check; reproduce, run every gate, push once. Push a squashed branch, not the working branch |
| A change to how work is briefed | A packet that states the status of earlier work as a fact instead of leaving it to be inferred |
| A correction to our own wording or reasoning | Context completeness and the surprise rule are two ideas, not one; the documents and the glossary were corrected |
| Nothing, with the reason | A known limitation accepted on purpose (register items marked Accepted) |

## Examples

| What surprised | Step and mode | Found by | Outcome |
|---|---|---|---|
| The service boundaries had been decided by scaffolding four services | Plan, implement; solo | Drawing the container diagram | ADR-0009 |
| Every service must validate its own tokens, whatever the gateway does | Plan; chat | Choosing an API gateway | ADR-0008, a note on ADR-0006, NFR 3.1 |
| Who owns stock and when it is reserved | Plan; iterative with the lead | Writing the order lifecycle | ADR-0017, accepted that day |
| How one service proves itself to another | Implement; iterative | Ordering needing the catalog's stock endpoints | ADR-0018 (accepted 2026-10-31) |
| A rejected checkout spends its idempotency key | Review; real-stack run | The first browser journey against the real stack | The first-slice contract, section 6; the client takes a new key; register 81 |
| Events that cannot be deserialized are dropped without dead-lettering | Review; reconciliation | A September check that stayed open | Register 88; a note on ADR-0003 |
| Fixing failing PR checks one push at a time hid what else was failing | Implement, review; delegated pipeline | The lead, seeing two runs queued | A working practice: reproduce each failure, run every gate, push once (`docs/process/branching-strategy.md`) |
| A squash merge was assumed to keep early commits out of `main` | Plan; chat | Reading the branch history | A change to how branches are pushed; register item 93 |
| Context completeness and the surprise rule were treated as one idea | Iterative document work; chat | The lead | Two documents, a corrected glossary, and this lesson |
| The same fact is written in many places and drifts | Review; the October document review | Reading every document | Generated status, a `Status:` on every register item, and checks that are not yet enforced (register 90) |
| One of ten approved mutation checks was missing from the first batch | Delegate, verify; interactive | Tallying results against the approved list | The baseline notes it; the check was run afterwards |

## Signals worth acting on

- "I assumed..." or "I thought you meant..." from either side.
- A result nobody predicted, good or bad.
- A diagram, spec or test that shows a decision was made by default (a folder layout, a service name, an identifier format).
- A test that passes for a reason other than the one it names.
- A real run that contradicts what the documents say.
- The same kind of question or fix coming up a second time.

## What the rule is not

- It is not blame. A surprise means the process had a gap, not that someone failed.
- It is not an excuse for skipping the proactive work. Asking early costs less than finding out late.
- It is not unlimited scope. The response is proportionate, and anything that would expand the scope of a work item still needs the lead's approval first (`CLAUDE.md`).
- It is not only for mistakes. A pleasant surprise (something worked better than expected) is also worth a line, so the practice behind it is kept.

## Related

[Context completeness](context-completeness.md) · [the lessons record](lessons.md) · [register item template](register-item-template.md) · [glossary](glossary.md) · `docs/governance/architecture-review.md` (how an ADR is amended or superseded when a surprise changes a decision) · `WI-REPO-003` (how loose notes and ideas are captured, under review)
