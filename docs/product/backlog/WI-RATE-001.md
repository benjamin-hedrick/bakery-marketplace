> **Status:** In progress

```
WI ID:                RATE-001
Title:                First rate limits: per address and per login at the web apps, a coarse backstop at the BFF (register item 128)
Type:                 Library (with route wiring)
Epic:                 EPIC-RATE-LIMITING
Shared with epic(s):  EPIC-AUTH
Hat/Owner:            Engineering/Build, Security
Status:               In progress
Size:                 M
Verification class:   V3 (a limit on login and request routes; touches the shared session package). Classes are proposed in `docs/process/verification-policy.md`.
ADRs and NFRs affected: ADR-0008 (API Management cannot limit per user, so this is the service-layer part), ADR-0019 (the session routes), ADR-0021 (stream opens); NFR 3.8 (abuse resistance and per-caller limits).
```

**Context / Why**
`WI-QUE-003` limited what one connection or login may hold, but nothing limits how fast a caller may open them, log in or send requests (register item 128; item 27). API Management cannot limit per user (ADR-0008). This is the first, cheap step.

**Decisions (the lead, 2026-11-02):** limit state is in memory per process behind an interface (a Redis version can follow); the caller's address is the socket address plus a configured count of trusted proxy hops (default 0, `X-Forwarded-For` ignored); numbers are the starting values below, set in configuration; the web apps get per-address and per-login limits and the BFF gets one coarse backstop.

**Inputs / References**
- *Decisions*: ADR-0008, ADR-0019, ADR-0021, `docs/architecture/nfrs.md` section 3.8.
- *Code*: `packages/web-session/src/handlers.ts` and `runtime.ts` (the routes both web apps mount); `services/graphql-bff/src/server.ts`.
- *Test methodology*: `docs/process/verification-policy.md` (V3, limits checklist).

**Out of scope**
- Per-user limits at the services; limits at API Management; a shared (Redis) limiter; rate limits on the public catalog pages' server rendering; per-action limits for vendors; ad-fraud and review abuse (`RATE-002`, `RATE-003`).

**Requirements / Acceptance Criteria**
1. A token-bucket limiter with a bounded number of keys (the least recently used key is dropped beyond the bound), a clock that tests can control, and the interface `take(key)` returning allowed or the seconds to wait.
2. The caller's address: the connection's address by default, with an IPv4-mapped IPv6 address shown as IPv4; with `TRUSTED_PROXY_HOPS=n` the entry n places from the right of `X-Forwarded-For` (a missing or too-short header falls back to the connection's address); a header with more entries than hops, or a forged first entry, is never trusted.
3. Web routes (the shared package, so both apps), default values per minute, each settable by the named variable: `/api/auth/login` and `/api/auth/callback` 10 per address (`RATE_LIMIT_LOGIN_PER_MINUTE`); `/api/graphql` 120 per login, and per address when there is none (`RATE_LIMIT_GRAPHQL_PER_MINUTE`); stream opens 10 per login (`RATE_LIMIT_STREAM_PER_MINUTE`). Added by the implementer and flagged: one address ceiling of 600 per minute across `/api/graphql`, `/api/graphql-stream`, `/api/auth/me` and `/api/auth/logout` (`RATE_LIMIT_ADDRESS_PER_MINUTE`), checked before the session is looked up so that a flood of junk cookies cannot reach the session store without limit.
4. A refusal on a JSON route is `429` with `Retry-After` (whole seconds, at least 1), `Cache-Control: no-store` and a fixed sentence; nothing is forwarded to the BFF or the store. A refusal on the login routes redirects to the existing error page with the code `rate_limited` and a fixed sentence.
5. The BFF has one backstop, `BFF_RATE_LIMIT_PER_MINUTE` (default 600) per source address on its `/graphql` route (and the stream), refused with `429` and `Retry-After`.
6. A setting that is not a whole number from 1 to 100000 stops the web runtime or the BFF from starting, naming the variable (not its value), like the session settings.
7. Normal use is not refused: a vendor screen that polls every 7 seconds and acts, a customer who browses, and the login flow stay far below the limits, shown by the existing suites running with the default limits on the real stack.
8. Each limit has a test that a burst is refused and the next window allows again; keys are separate (one address or login does not use another's); memory is bounded under many keys; the refusal reaches nothing behind it; a spoofed `X-Forwarded-For` does not change the key at the default.
9. Tests that guard these properties were shown to fail with the limit taken out; the outcome note says how.
10. NFR 3.8, the test strategy and `docs/operations/local-dev.md` are updated; register items 27, 126 and 128 are updated.

**Dependencies**
- Blocked by: none. Approved by the lead 2026-11-02 (design and the change to `packages/web-session`).

**Verification**
V3 from `docs/process/verification-policy.md`. Abuse cases: a burst from one address, a burst of logins, many addresses (memory), a forged forwarding header, a junk cookie flood, a legitimate user while another is limited.

**AI-agent suitability**
Full for the build. Flag, do not choose: the numbers in production, trusted-hop settings for any deployed ingress, and any move to a shared limiter.

**Open Points (working)**
- [ ] Production numbers and the trusted-hop count are decided with the deployed environment (`WI-DEP-001`).
- [ ] A shared limiter (Redis) when more than one replica serves a web app.
