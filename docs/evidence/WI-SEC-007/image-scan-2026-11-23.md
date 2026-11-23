# First container image scan (2026-11-23)

> **Status:** Current · `WI-SEC-007`, the first run of `scripts/ci/image-scan.mjs` (Trivy 0.76.2, pinned by digest, in Docker), run by the agent on the lead's Windows machine. The full per-image findings are in [`2026-11-23/summary.md`](2026-11-23/summary.md); the tool's raw JSON (9 MB) was not committed (`.gitignore`). Nothing was changed because of it: the decisions below are the lead's.

## What was scanned

The six images the dev stack deploys (`scripts/ci/dev-images.mjs`: catalog, ordering, graphql-bff, web, mock-oidc and the seed job), **built here** one at a time with no credentials, from the `main` tree plus the branch's changes, and the five images the Compose file pulls from elsewhere. Vulnerabilities only (no secret or configuration scanning). All 11 scanned. The first run did not finish the Cosmos emulator (Trivy's 5-minute default timeout); the script now allows 30 minutes, and the table below is from the second run (`--no-build`, the same built images).

| Image | Where it runs | Critical | High | Fixable high or critical |
|---|---|---:|---:|---:|
| `bakery-catalog`, `bakery-ordering`, `bakery-mock-oidc`, `bakery-seed` | deployed to dev | 0 | 5 each | 5 each |
| `bakery-bff`, `bakery-web` | deployed to dev | 1 each | 43 each | 6 each |
| `otel/opentelemetry-collector-contrib:0.164.0` | deployed to dev (tracing) | 0 | 2 | 2 |
| `redis:7.4-alpine` | local, and the dev Redis apps | 0 | 0 | 0 |
| `jaegertracing/jaeger:2.22.0` | local only (the `jaeger` profile) | 0 | 9 | 9 |
| `mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-EN20261019` | local only | 8 | 74 | 80 |
| `mcr.microsoft.com/dotnet/aspire-dashboard:13.6.2` | local only (the `tracing` profile) | 0 | 0 | 0 |

**Result: exit 1.** Every image except Redis and the Aspire dashboard has at least one high or critical finding with a fix. Which images run in Azure is read from the repository (the six images from `dev-images.mjs`, the collector from `infra/modules/environment/main.tf`); the Redis apps' image was not checked.

## What the findings are

- **The four .NET images (5 each):** the same five in each. `apt` and `libapt-pkg6.0t64` 2.8.3 (Ubuntu 24.04, fixed in 2.8.4ubuntu0.1), and three findings in the ASP.NET Core runtime 10.0.14 that the base image carries (fixed in 10.0.15). Their base is `mcr.microsoft.com/dotnet/aspnet:10.0`, a floating tag, so a rebuild takes whatever is current; whether the 10.0.15 image is published was not checked.
- **The two Node images (6 each):** `undici` 6.28.0 (four) and `brace-expansion` 5.0.9 (two). The paths are `usr/local/lib/node_modules/npm/node_modules/...`: npm's own bundled copies inside the `node:24-slim` base image, not the apps' dependencies. Whether a running app ever loads npm's copy was not checked. Each image also has one critical, `zlib1g` (Debian 12, CVE-2023-45853), with **no fix available**, so it is reported and does not fail the scan.
- **The collector (2):** `go-jose` v4.1.5 (fixed in 4.1.6) and `golang.org/x/net` v0.61.0 (fixed in 0.62.0), both inside the collector binary.
- **Local-only images (Jaeger, the Cosmos emulator):** 9 and 80 fixable high or critical findings. They run only on a developer machine, and Microsoft publishes the emulator image; nothing here can fix them except a newer tag.

## What this does and does not show

- Shows: the scan runs end to end from one command, on the exact images the pipeline builds and on the third-party images, and the exit-code logic works (unit tests on canned reports, and this run's exit 1).
- Does not show: that any finding is exploitable in this stack, or reachable; that a rebuild or a newer base tag clears them (not tried); anything about the images in Azure Container Registry as pushed (this scanned local builds of the same Dockerfiles); a scan of Terraform or configuration.

## Decisions for the lead (register 240)

1. **Rebuild on the current base tags and rescan** before the next deploy, to see how many clear with no change (the .NET runtime and apt items should, if the newer images exist). Cheap, and it is the first thing to try.
2. **Whether the Node base image is changed or pinned** because of npm's bundled copies: options are to remove npm from the runtime image, a newer `node:24-slim`, or to accept it because the app does not run npm.
3. **A pipeline job**, and whether it blocks: not decided. With this many fixable findings on a floating base, a blocking job would fail today. Suggested: non-blocking first, as with the audit job (`WI-SEC-006`).
4. **The local-only images:** accept them as local-only, or move Jaeger's and the emulator's tags when newer ones come out.
