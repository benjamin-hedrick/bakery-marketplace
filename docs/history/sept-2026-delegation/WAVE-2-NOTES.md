# Delegation Wave 2 — Notes (companion to `docs/product/backlog/delegation-packets/README.md`)

> **Status:** Historical · moved 2026-10-30 from `docs/product/backlog/delegation-packets/`. September 2026 packets handed to AI agents, kept as a record of how work was delegated then; the October work was done in interactive slices instead. The text is unchanged; relative links in it no longer work.

Packets 01–04 (base .NET scaffold, Cosmos/Redis adapters, event transport + ownership pattern,
mock OIDC issuer) were the first wave. Per `local-demo-execution-plan.md` (2026-09-16), Packet 04's
item (`WI-AUTH-005`) turned out **not** to have actually been built beyond a data record
(`MockUser.cs`) — this wave corrects that rather than assuming it forward.

## This round's packets (05–07)

| Packet | Item(s) | Why grouped this way |
|---|---|---|
| 05 | `WI-AUTH-005` (rebuild) | Solo — highest-risk item per the execution plan; single blocker for `WI-DEV-002` (soft) and `WI-WEB-001` (hard), so it stays isolated for visibility the same way it was in Wave 1 |
| 06 | `WI-ORD-004` | Solo — the one blocking node for the entire Ordering track (`ORD-002`, `ORD-003` both wait on it); shipping and reviewing it alone unblocks the next wave fastest |
| 07 | `WI-CAT-001`, `WI-PREF-001`, `WI-VEN-001` | Grouped — same task shape (first CRUD implementation per bounded context against an already-frozen `IRepository<T>`), zero shared code, and every one of their code-level blockers (`DATA-002`, `EVT-003`, `AUTH-002`, `DEV-001`) is already done |

All three packets are mutually independent. None of them requires `WI-DEV-002` (docker-compose) to
exist to be *built* — only to be locally *integration-tested* end-to-end afterward, which is a
separate, later step.

## Why `WI-DEV-002`/`WI-DEV-004` are not in this round

Both are real, Ready items, but per the existing packets README's own rule ("becomes packet-able
once these are actually built and reviewed — not before"), `WI-DEV-002` is soft-blocked on
`WI-AUTH-005` actually existing (Packet 05), and `WI-DEV-004` is blocked on `WI-DEV-002`. Package
them as **Wave 3** once Packet 05 lands and is reviewed.

## Once this wave lands: Wave 3 candidates

- `WI-DEV-002` + `WI-DEV-004` (paired — same "environment wiring" shape, direct sequence)
- `WI-ORD-002` + `WI-ORD-003` (paired — both blocked only by `WI-ORD-004`/Packet 06, no shared code, can run in parallel with each other)
- `WI-PREF-002` + `WI-VEN-002` (paired — both blocked only by their respective Packet 07 items, same "publish an event once the profile exists" task shape)
- `WI-CAT-003` (solo or paired with the above — blocked by `WI-CAT-001`/Packet 07 and the already-built `CACHE-002`)

Not yet packet-able even after Wave 3: `WI-ORD-006`, `WI-ORD-005` (need `WI-ORD-002` reviewed first),
`WI-ORD-001`, `WI-QUE-001` (need `WI-ORD-006`/`WI-ORD-005` reviewed first), and all of M3
(`WI-WEB-001` onward, hard-blocked on `WI-AUTH-005`'s real PKCE server, not just its spec).
