> **Status:** In review · evidence: the Outcome note under this banner; `docs/evidence/WI-RATE-001/`

> **Adjustment (2026-11-06, register 137, option B chosen by the lead):** the BFF's backstop (point 5 below) now counts per client when the caller is the web app. The web app sends the address it counted the browser by in `X-Bakery-Client-Address`; the BFF believes that header only from a connection whose address is in `BFF_TRUSTED_CLIENT_SOURCES` (the web app's address; unset trusts nobody) and otherwise counts the connection's own address, so the Android app and direct callers are counted as before. The header is never copied from the browser. Tests: `services/graphql-bff/test/client-address.test.ts`, and the proxy and handler tests in `packages/web-session` (each shown to fail with the check, or the header, removed). Not yet set for the deployed dev environment (the web app's address there is not fixed): register 137.

> **Outcome note (2026-11-02):** built on `feature/rate-limiting`, not merged. `packages/web-session/src/rate-limit.ts` holds the token bucket (bounded to 10,000 keys, injectable clock), the address rule and the settings; both web apps get the limits through the shared handlers (35 new package tests, 162 in all, 13 Redis tests skipped without Redis). The BFF has its own small copy of the bucket and the backstop (8 new tests, 115 in all). A second copy of the queue display runs with tight limits and one trusted proxy hop for 4 browser tests (36 in all). Tests were shown to fail with the login limiter, the stream limiter, the key bound, the proxy-hop rule, the order of the address check and the BFF refusal taken out; the browser tests were not mutated. The real-stack journeys (`skeleton-smoke.mjs`, 25 passed on this branch) run with the default limits and none was refused. **Changes from the plan:** the browser suites set the web limits out of the way (they log in faster than any person); acceptance 7 is therefore shown by the package test of a vendor screen polling for ten minutes and by the real-stack run, not by the mock-backed suites. **Not done:** a shared limiter, production numbers, per-action limits, a test under load (register item 129), any run on Azure or behind a proxy.


```
WI ID:                RATE-001
Title:                First rate limits: per address and per login at the web apps, a coarse backstop at the BFF (register item 128)
Type:                 Library (with route wiring)
Epic:                 EPIC-RATE-LIMITING
Shared with epic(s):  EPIC-AUTH
Hat/Owner:            Engineering/Build, Security
Status:               In review
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
7. Normal use is not refused: a vendor screen that polls every 7 seconds, a customer who browses and the login flow stay far below the limits. Shown by a package test of a screen polling for ten minutes with the default limits, and by the real-stack journeys running with the defaults. The mock-backed browser suites log in faster than any person and have the web limits set out of the way.
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
