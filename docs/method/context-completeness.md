# Context completeness

> **Status:** Current · revised 2026-10-30. The proactive half of two ideas; the reactive half is [the surprise rule](surprise-rule.md).

**Context completeness** is making sure that whoever does a piece of work has what they need to do it, before they start. It is about the working process, and above all about delegated work: work that is planned by one party and done by another, where what the planner knows does not travel on its own.

## The goal: self-contained, efficient work

Complete context lets a piece of work be picked up and finished without going back to the planner. It does that by removing four costs:

- **Analysis.** The delegate does not have to work out what the situation is, what was decided, or what the constraints are; they are stated.
- **Repeated work.** Nobody re-analyzes, re-plans or re-evaluates something that has already been vetted and approved. A decision made once is handed over as made, with where it was made, so it is not reopened.
- **Rework.** The aim is to get it right the first time. Most rework traces to a missing constraint, a stale spec, or a decision the delegate had to guess.
- **Round trips.** Questions that could have been answered in the brief do not interrupt the lead, or stall an agent that cannot ask.

Completeness is judged by what the work needs, not by volume. More context than the work needs buries the part that matters and is itself a cost.

## What "enough" depends on

The right amount and shape of context differs by delegate:

- **Repository access.** A delegate who can read the repository can find an interface, an ADR or a test suite themselves; handing it over again adds nothing. One who cannot see the repository (a chat session with only what is pasted in) needs the content itself.
- **Human or AI.** A person new to the project can ask a question and gets an answer. An agent working alone cannot, so what it must not guess has to be written down, and the points where it should stop and ask have to be named.
- **Capability and skill.** What the delegate already knows about the stack, the domain and the conventions of the codebase, and how much can safely be left to their judgment.
- **How much of the analysis and planning is theirs to do.** The aim is that they need to do as little analysis and planning as the task allows. Their ability to plan decides how much of the plan to hand over: for a strong planner, a goal and the constraints; for a delegate who plans less well, the steps in order, the acceptance checks and the stopping point. In both cases, anything already analyzed or decided is handed over so it is not done again.

It applies at every step of the process: **plan, delegate, implement, review, refine.**

## At each step

| Step | The question | How it is done in this repository |
|---|---|---|
| **Plan** | Has everything the plan depends on been decided and written down, so that nobody has to assume it, and are the decisions already made easy to find and clearly final? | Assumptions are listed before an ADR is drafted (`docs/governance/architecture-review.md`). Domain exercises such as event storming surface what nobody had named. ADRs and their status lines make a decision citable and show whether it is settled. The decision checklists ([decision-checklists.md](decision-checklists.md): technology and business) are the front-loaded version, run once early; they were written retrospectively |
| **Delegate** | Does the brief carry what this delegate needs, and nothing that buries it? | The work item ([`work-item-template.md`](work-item-template.md)): a bounded list of references grouped as decisions, interfaces, environment, test method and business context; "You do not need to know about"; "Out of scope"; open points with an owner; AI-agent suitability. The Definition of Ready ([`docs/process/definition-of-ready.md`](../process/definition-of-ready.md)) checks it before work starts. A **delegation packet** goes further than the work item: it is a self-contained brief with instructions (what to build, in what order), guidelines (conventions, what to do when something is ambiguous), limits (what to leave alone, what needs approval), the status of related work stated as fact, the definition of done and how to hand the result back; it points at the work item for the full spec |
| **Implement** | Can the delegate tell, at the point of doubt, whether to continue, stop or ask? | Stop conditions and the human-approval list in `CLAUDE.md` (security, auth logic, IAM and RBAC, expanding the scope of an item, refactoring); "stop when contracts are ambiguous" (`docs/management/portfolio-slice/04-cache-and-ai-evidence.md`, and the rules in `05-agent-rules-and-sequence.md`) |
| **Review** | Does the reviewer have the same context the delegate was given, so the work is judged against the right thing? | The reviewer checks the change against the work item's acceptance criteria and the ADR it cites (`docs/process/engineering-standards.md`). Results are reported as passed, failed, skipped or not run, so a reviewer never has to trust a summary |
| **Refine** | Is what was learned written back to where the next delegate will look, so the analysis is not repeated? | Outcome notes on specs, dated notes on ADRs, register items for what was found and not fixed ([`register-item-template.md`](register-item-template.md)), and the status banner so the next reader sees the real state. A spec is rewritten to match what was built, because the next delegate will trust the file |

## What completeness is not

- It is not putting everything in front of the delegate. The template caps references, and the Definition of Ready says to split an item whose references grow past about five, because too much context hides the part that matters.
- It is not a one-time sweep. Some gaps cannot be seen in advance; those are the reactive half, the [surprise rule](surprise-rule.md).
- It is not the same for every delegate (above). The same work item written for an agent with repository access would be wrong for a chat session without it.

## Examples from this repository

- **An assumption that lived only in the lead's head.** The zero-trust posture (every service validates its own tokens, whatever sits in front of it) was always the lead's intent, but it was written into no document until choosing an API gateway made it relevant. It is now stated in ADR-0008, the amendment on ADR-0006 and NFR 3.1. Without it, a gateway decision was being made without a constraint that governed it.
- **A decision made by an early action.** Four services were scaffolded before any mapping of bounded contexts to services had been decided, so naming the four services was itself an architecture decision made without a record. It was found when the container diagram was drawn, and became ADR-0009. The proactive version is to ask, before scaffolding, which structural decisions the scaffold implies.
- **Domain events nobody had named.** The event-storming pass surfaced four business events that existed in practice but in no document (`docs/architecture/ddd/event-storming.md`).
- **A spec that carried the wrong context.** Several specs described a design that was not built (a cart endpoint, a different order lifecycle, a card-entry form) and would have sent the next delegate down the wrong path, or made them re-derive what had been decided. They were rewritten to match the build in October 2026 (`status-and-supersession.md`).
- **A delegate told to work from history.** A September packet for the mock identity issuer had to say outright that an earlier packet for the same item had not been completed and must not be assumed to have been: a fact the planner held and the delegate could not look up. See [AI collaboration](ai-collaboration.md), handoff integrity.

## A short check before handing work over

1. Could the delegate find every reference without help? If not, include the content or say where it is.
2. Have the decisions already made been stated as made, with where, so they will not be re-analyzed or re-opened?
3. Is the part of the plan that is settled handed over, and is it clear which part the delegate is expected to plan?
4. Is the scope stated both ways: what to do and what to leave alone?
5. Is the status of related work stated as a fact (done, superseded, in progress), not left to be inferred from history?
6. Are the decisions the delegate must not make by themselves named, with who decides?
7. Does the delegate know when to stop and ask, and how to hand the result back?
8. Will what they learn have somewhere to go (the spec, an ADR note, the register)?

## Related

- [The surprise rule](surprise-rule.md): what to do when something was missed anyway.
- [AI collaboration](ai-collaboration.md): how delegated work is run here, and where it went wrong.
- [Work-item template](work-item-template.md), [Definition of Ready](../process/definition-of-ready.md).
