# Delegation Packets

> **Status:** Historical · moved 2026-10-30 from `docs/product/backlog/delegation-packets/`. September 2026 packets handed to AI agents, kept as a record of how work was delegated then; the October work was done in interactive slices instead. The text is unchanged; relative links in it no longer work.

A distinct artifact class from the `WI-*.md` work-item files: those are the
human-facing planning record (full categorized references, Open Points,
Definition of Done pointer, etc.); these are condensed for handing directly to
an agent that already has repo access.

## What's different from a `WI-*.md` file, and why

An agent with repo access can grep for a referenced interface or ADR itself —
restating that content in a packet adds nothing. What repo access does *not*
give an agent: which parts of the system this specific item should touch,
which parts it deliberately shouldn't, and which of several possibly-stale
copies of a spec is actually current. So each packet:

- **States scope boundaries in full** (Out of scope / You do not need to know
  about) — these are judgment calls, not repo-discoverable facts
- **Points at, rather than restates, anything the agent can look up itself**
  (interface files, ADRs, contract-test suites)
- **Names the current wave's dependency reality explicitly** — which packets
  in this round are truly independent, so an agent isn't left guessing
  whether to wait on a sibling packet
- **Flags known drift risk** where this repo has previously had a spec go
  stale relative to something that referenced it (see Packet 04's note) —
  repo access doesn't resolve staleness, it just makes both versions visible

## This round's packets

| Packet | Item(s) | Why grouped this way |
|---|---|---|
| 01 | `WI-DEV-001` | Solo — foundational blocker, kept isolated for visibility |
| 02 | `WI-DATA-002`, `WI-CACHE-002` | Same task shape (concrete adapter behind an already-frozen interface); no shared code |
| 03 | `WI-EVT-003`, `WI-AUTH-002` | Handoff convenience only; no shared code or sequencing |
| 04 | `WI-AUTH-005` | Solo — recent revision history worth flagging distinctly, and it's the single blocker for the entire frontend track |

All four packets are mutually independent — no coordination needed between
them regardless of how many agents pick them up or in what order.

## Once this wave lands

The next wave (Batch 3b: `DEV-002`/`DEV-004`; then Batch 4) becomes packet-able
once these four are actually built and reviewed — not before. See
`docs/product/backlog/MASTER-BACKLOG-OUTLINE.md`'s On Deck list for what's
next in the queue.
