# Dependency review: graphql-sse 2.6.3 (WI-QUE-003, ADR-0021 decision 1)

> **Status:** Done · reviewed by the AI agent on 2026-11-02 and accepted by the lead the same day (pinned at exactly 2.6.3). This is a review of a package, not an independent audit. Tool versions and raw outputs are summarised, not archived; the commands are given so the checks can be repeated.

## Decision

`graphql-sse` **2.6.3**, pinned exactly (no range), in `services/graphql-bff` (server handler) and `apps/web-queue-display` (browser client). Installed with `npm install --save-exact --ignore-scripts`. The BFF's other runtime dependency (`graphql`) is also pinned exactly; this follows that convention.

## What it is

| | |
|---|---|
| Registry data | MIT; zero runtime dependencies; peer `graphql >=0.11 <=17` (the BFF runs 16.14.2); no install, preinstall, postinstall or prepare script in the published package; about 316 KB unpacked, 55 files |
| Integrity (npm lockfile, both projects) | `sha512-UCSx3a+IklDOqJt8gpxGwDhnmWiZLJ5wNPMJ7TLGOQ68PhiKIDxLJBB2i+nKEGyWYLtiSLpTJ5fFEG5kkAxppA==` |
| Published | 2026-10-15, 18 days before the review; 2.6.2 on 2026-09-29, 2.6.1 on 2026-08-25, 2.6.0 on 2025-10-22 |
| Use | about 512,000 downloads in the week 2026-10-26 to 2026-11-01; 461 GitHub stars, 7 open issues, not archived |
| Advisories | 0 in the GitHub advisory database for the npm package `graphql-sse` (unauthenticated API query on 2026-11-02) |
| Maintenance | releases by `semantic-release` from `master`; fixes in 2.6.1 to 2.6.3 came from community contributors; the maintainer's own last commit was 2026-08-25 |

## Why 2.6.3 and not 2.6.0

2.6.0 is the older and longer-used version, but 2.6.2 and 2.6.3 fix two defects that matter to a long-lived stream:

- **parser** (2.6.2): complete messages were not flushed when a chunk ended mid-line, so an update could be held back until the next chunk. The stream's delay is what `WI-QUE-003` measures.
- **client** (2.6.3): the listeners of ended subscriptions were not dropped. The queue display runs unattended and reconnects by design (the stream ends at the token's expiry or after 1 hour).

2.6.1 adds graphql 17 support (the peer range) and changes nothing the BFF uses. Writing the protocol ourselves (about 150 lines, no dependency) was considered and declined: ADR-0021 chose the library, and we would own the parsing defects that 2.6.2 just fixed.

## What was checked

1. **Contents.** The 2.6.0 and 2.6.3 tarballs were fetched with `npm pack --ignore-scripts` into separate scratch directories. Between them, 18 files differ: the client, the parser, the five server wrappers (http, http2, express, fastify, koa) and the UMD bundles, plus `package.json`. The core `handler.mjs` is byte-identical. The differences read as bug fixes (listener cleanup, the parser flush, stopping writes to ended or destroyed responses) and the graphql 17 peer range. The client, parser, express and http changes were read line by line; the fastify, koa and http2 changes follow the same pattern as http and express and were not read line by line.
2. **Patterns.** A search of the shipped ES module code found no `eval`, `new Function`, `child_process`, `fs`, `net`, `os`, `dns`, `process.env` or XMLHttpRequest. The only Node imports are `http` and `http2`, in the wrappers.
3. **Provenance.** No version of the package carries an npm provenance attestation (`npm view graphql-sse@<version> dist.attestations` is empty for 2.5.4, 2.6.0, 2.6.1 and 2.6.3), so the published file could not be tied to the source by signature. It was tied by rebuilding: the git tag `v2.6.3` (commit `4cced455cb7a23beda9e9bf7a403aab270bd4e66`, the `semantic-release-bot` commit of 2026-10-15, identical to the head of the default branch `master`) was cloned in a `node:24` container, installed with `yarn install --immutable --mode=skip-build` (the repository's own `yarn.lock`, 4.0.2, no lifecycle scripts) and built with the repository's `yarn build`. The 51 files under `lib/` and `umd/` have the same names and the same SHA-256 as the published package (51 identical, 0 different), and every `package.json` field matches except `workspaces`, which the package's own `prepack` removes.
4. **Installed state.** After `npm install --save-exact --ignore-scripts graphql-sse@2.6.3` in both projects, each lockfile gains one package entry (`node_modules/graphql-sse`, version 2.6.3, the integrity above, no dependencies) and nothing else changes. `npm audit --omit=dev` finds 0 vulnerabilities in both. The full `npm audit` reports 11 (BFF) and 15 (queue display) moderate vulnerabilities in development tools; the counts are the same before the pin (checked by stashing the change), and none names `graphql-sse`.

## What this does and does not show

- **Shows:** the package on npm is exactly what the public source at that tag builds to; the shipped code contains nothing from the patterns searched; the versions we use fix the two defects above; no known advisory.
- **Does not show:** that the library is free of defects or that all of its source was read (about 70 KB of shipped code; the 2.6.0 to 2.6.3 changes and the pattern search were the review); that the publisher's account is trustworthy (there is no signed attestation); anything about the repository's development dependencies, which do not ship.

## How it will be used (and what is deliberately not exposed)

- **BFF:** `graphql-sse/lib/use/http` serves `Subscription.vendorOrderChanged`. The BFF's own router sends only `POST /graphql` requests with `Accept: text/event-stream` to the handler; every other method and path stays a 404 as today. This keeps the library's "single connection mode" (a `PUT` that creates a stream token held in memory, with no authentication of its own) and its `GET` form unreachable. The bearer token comes from the request's `Authorization` header into the resolver context, as for queries; nothing is read from a URL.
- **Apps:** the browser client in distinct-connections mode only. The server's keep-alive ping (every 12 seconds) is compatible with the screen's rule that no frame for 45 seconds means the stream is down.
- **Not used:** the express, fastify and koa wrappers (their packages are not installed).

## Repeating the checks

```
npm view graphql-sse@2.6.3 dist.integrity dist.attestations
npm pack graphql-sse@2.6.3 --ignore-scripts          # in an empty directory
git clone --branch v2.6.3 https://github.com/enisdenjo/graphql-sse.git
# in a container: corepack enable; yarn install --immutable --mode=skip-build; yarn build; compare lib/ and umd/ with the unpacked tarball (sha256)
```

When the version is raised, repeat items 1 to 4 for the new version and record it here.
