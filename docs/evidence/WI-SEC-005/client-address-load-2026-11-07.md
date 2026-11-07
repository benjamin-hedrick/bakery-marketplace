# Register 137: the BFF's rate limit counted per client, shown under load

> **Status:** Snapshot · 2026-11-07

**Current result:** passed for the local stack. With the BFF's backstop at its default (600 a minute), eight readers in a tight loop use up the shared counter and the ordering customer is refused; when each reader and the customer send their own `X-Bakery-Client-Address`, no order is refused outside the outage. One run of each, three minutes.

- **Commit:** `416023c` on `feature/mobile-session-tests` (the product code of register 137 is from 2026-11-06; this commit only gives the load script the two options below).
- **Commands:** `node scripts/dev/load-test.mjs --minutes 3 --bff-rate-limit 600` (control) and `node scripts/dev/load-test.mjs --minutes 3 --bff-rate-limit 600 --client-addresses` (fix). Both: eight readers, an order every 3 seconds, ordering stopped for 8 seconds at the midpoint, five vendor streams.
- **How the fix is exercised:** the script runs on the same machine as the BFF, whose `BFF_TRUSTED_CLIENT_SOURCES` is `127.0.0.1,::1` (`scripts/lib/local-stack.mjs`), so the header is believed. `--client-addresses` sends `10.10.0.1` to `10.10.0.8` for the readers and `10.20.0.1` for the customer. Without it, no header is sent and all of them share the connection's address.
- **Not shown here:** the web app's own sending of the header (covered by the web-session tests and the container smoke of 2026-11-06), and the deployed dev environment, which does not set `BFF_TRUSTED_CLIENT_SOURCES` yet (register 119). The readers loop without a pause, so the numbers of refused reads are a stress figure, not a rate any person would reach.

| | Control (no client header) | Fix (per-client header) |
|---|---:|---:|
| Orders placed | 3 | 55 |
| Orders refused outside the outage | 51 (`RATE_LIMITED`) | 0 |
| Orders failed during the 8 s outage | 6 | 5 (`INTERNAL`, expected) |
| Reads answered | 2,304 | 18,487 |
| Reads refused (429) | 1,552,166 | 1,210,965 |
| Streams: limit of five held, first two ended | yes | yes |
| Orders missed by a stream | 0 | 0 |

**What it shows:** in the control the readers share the customer's counter, so almost every order is refused (51 of 54 outside the outage). With per-client counting the customer's counter is their own: every order outside the outage is placed. The readers are still refused when they exceed their own allowance, which is the limit working on the abusive callers, not on everyone. Streams were unaffected in both runs.

**Limits of this evidence:** one run each on one machine; the control exits 0 because the script only treats a refused order as a failure with `--client-addresses` (so the control can be shown without a failing exit); the readers' refusal counts are dominated by a tight loop and should not be read as capacity.
