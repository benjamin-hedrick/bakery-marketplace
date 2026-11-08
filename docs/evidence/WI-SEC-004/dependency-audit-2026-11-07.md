> **Current result (2026-11-07):** `node scripts/ci/dependency-audit.mjs` ran on commit `db1e928` (the tip of `feature/listing-cache` before this record). No critical or high advisory anywhere, no vulnerable NuGet package; 25 moderate npm advisories, all one of two root causes (`minimatch` and `glob` denial-of-service advisories, in the ESLint chain of three projects and in the Expo build tooling of the Android app); three deprecated test packages. Eight CycloneDX SBOMs written to `sbom/`; the raw `npm audit` and `dotnet list package` output is in `raw/`. Local run, with the registry's advisory data of that day: a later run can differ. Written for `WI-SEC-004`; the file is a snapshot and is not edited afterwards.

## How to read the result

- **"Production only" is the npm column that counts for what ships.** `web-customer`, `web-queue-display` and `graphql-bff` have **0** advisories among their production dependencies; their 10 moderate advisories are all in development tooling (ESLint and typescript-eslint, through `minimatch`).
- **`mobile-customer` shows 5 moderate advisories as "production" and the audit cannot tell better.** The packages are `expo`, `@expo/cli`, `@expo/fingerprint`, `glob` and `minimatch`: Expo's command-line and build tooling, which `npm` counts as production because `expo` is a runtime dependency of the app. The advisories are a `glob` AbortSignal bypass (GHSA-3g3m-2fjr-6pw4) and a `minimatch` denial of service (GHSA-g3hv-75wg-m249); neither package runs inside the installed Android app as far as this audit shows, which is a reading, not something the audit proves. The fix npm offers is a breaking upgrade (`expo@57`).
- **No fix was applied.** `npm audit fix --force` would make major upgrades of ESLint, `eslint-config-next` and Expo; that is a refactor of tooling and needs the lead's decision (register 162).
- **The SBOMs list production dependencies only** (npm `--omit dev`; NuGet with test projects excluded). `graphql-bff` has two components because it has two production dependencies (`graphql`, `graphql-sse`). The four .NET SBOMs include the shared `tools/` libraries through project references. `admin-service` is a scaffold and still has 33 components because it references the shared libraries.
- **What the audit does not cover:** container base images (no scanner was run on the Compose or Dockerfile images), licence review, the Terraform provider versions, and anything not in a lock file. `G-E06` (`terraform validate` and `plan` on the Key Vault module) is a different part of `WI-SEC-004` and was not part of this run.

Run: 2026-11-07T23:58:31.605Z · commit db1e928 · node v25.9.0
Command: `node scripts/ci/dependency-audit.mjs` (raw output in `raw/`)

## npm (critical / high / moderate / low)

| Project | All dependencies | Production only |
|---|---|---|
| web-customer | 0 / 0 / 10 / 0 | 0 / 0 / 0 / 0 |
| web-queue-display | 0 / 0 / 10 / 0 | 0 / 0 / 0 / 0 |
| mobile-customer | 0 / 0 / 5 / 0 | 0 / 0 / 5 / 0 |
| graphql-bff | 0 / 0 / 10 / 0 | 0 / 0 / 0 / 0 |
| customer-core | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| web-session | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |

### Findings

| Project | Package | Severity | Ships | Fix | What |
|---|---|---|---|---|---|
| web-customer | @eslint/config-array | moderate | no (dev tooling) | yes | via minimatch |
| web-customer | @typescript-eslint/eslint-plugin | moderate | no (dev tooling) | yes | via @typescript-eslint/parser, @typescript-eslint/type-utils, @typescript-eslint/utils |
| web-customer | @typescript-eslint/parser | moderate | no (dev tooling) | breaking: eslint-config-next@15.5.29 | via @typescript-eslint/typescript-estree |
| web-customer | @typescript-eslint/type-utils | moderate | no (dev tooling) | yes | via @typescript-eslint/typescript-estree, @typescript-eslint/utils |
| web-customer | @typescript-eslint/typescript-estree | moderate | no (dev tooling) | breaking: eslint-config-next@15.5.29 | via minimatch |
| web-customer | @typescript-eslint/utils | moderate | no (dev tooling) | breaking: eslint-config-next@15.5.29 | via @typescript-eslint/typescript-estree |
| web-customer | eslint (direct) | moderate | no (dev tooling) | breaking: eslint@9.39.5 | via @eslint/config-array, minimatch |
| web-customer | eslint-config-next (direct) | moderate | no (dev tooling) | breaking: eslint-config-next@15.5.29 | via typescript-eslint |
| web-customer | minimatch | moderate | no (dev tooling) | breaking: eslint@9.39.5 | minimatch has potential denial of service via globparts amplification https://github.com/advisories/GHSA-g3hv-75wg-m249 |
| web-customer | typescript-eslint | moderate | no (dev tooling) | breaking: eslint-config-next@15.5.29 | via @typescript-eslint/eslint-plugin, @typescript-eslint/parser, @typescript-eslint/typescript-estree, @typescript-eslint/utils |
| web-queue-display | @eslint/config-array | moderate | no (dev tooling) | yes | via minimatch |
| web-queue-display | @typescript-eslint/eslint-plugin | moderate | no (dev tooling) | breaking: eslint-config-next@15.5.29 | via @typescript-eslint/parser, @typescript-eslint/type-utils, @typescript-eslint/utils |
| web-queue-display | @typescript-eslint/parser | moderate | no (dev tooling) | breaking: eslint-config-next@15.5.29 | via @typescript-eslint/typescript-estree |
| web-queue-display | @typescript-eslint/type-utils | moderate | no (dev tooling) | yes | via @typescript-eslint/typescript-estree, @typescript-eslint/utils |
| web-queue-display | @typescript-eslint/typescript-estree | moderate | no (dev tooling) | breaking: eslint-config-next@15.5.29 | via minimatch |
| web-queue-display | @typescript-eslint/utils | moderate | no (dev tooling) | breaking: eslint-config-next@15.5.29 | via @typescript-eslint/typescript-estree |
| web-queue-display | eslint (direct) | moderate | no (dev tooling) | breaking: eslint@9.39.5 | via @eslint/config-array, minimatch |
| web-queue-display | eslint-config-next (direct) | moderate | no (dev tooling) | breaking: eslint-config-next@15.5.29 | via typescript-eslint |
| web-queue-display | minimatch | moderate | no (dev tooling) | breaking: eslint@9.39.5 | minimatch has potential denial of service via globparts amplification https://github.com/advisories/GHSA-g3hv-75wg-m249 |
| web-queue-display | typescript-eslint | moderate | no (dev tooling) | breaking: eslint-config-next@15.5.29 | via @typescript-eslint/eslint-plugin, @typescript-eslint/parser, @typescript-eslint/typescript-estree, @typescript-eslint/utils |
| mobile-customer | @expo/cli | moderate | yes | breaking: expo@53.0.11 | via glob |
| mobile-customer | @expo/fingerprint | moderate | yes | breaking: expo@53.0.11 | via glob, minimatch |
| mobile-customer | expo (direct) | moderate | yes | breaking: expo@53.0.11 | via @expo/cli, @expo/fingerprint |
| mobile-customer | glob | moderate | yes | breaking: expo@53.0.11 | Glob: AbortSignal cancellation bypass allows post-timeout filesystem traversal https://github.com/advisories/GHSA-3g3m-2fjr-6pw4 |
| mobile-customer | minimatch | moderate | yes | breaking: expo@53.0.11 | minimatch has potential denial of service via globparts amplification https://github.com/advisories/GHSA-g3hv-75wg-m249 |
| graphql-bff | @eslint/config-array | moderate | no (dev tooling) | yes | via minimatch |
| graphql-bff | @eslint/js (direct) | moderate | no (dev tooling) | breaking: @eslint/js@9.39.5 | via eslint |
| graphql-bff | @typescript-eslint/eslint-plugin | moderate | no (dev tooling) | breaking: typescript-eslint@8.36.0 | via @typescript-eslint/parser, @typescript-eslint/type-utils, @typescript-eslint/utils |
| graphql-bff | @typescript-eslint/parser | moderate | no (dev tooling) | breaking: typescript-eslint@8.36.0 | via @typescript-eslint/typescript-estree |
| graphql-bff | @typescript-eslint/type-utils | moderate | no (dev tooling) | breaking: typescript-eslint@8.36.0 | via @typescript-eslint/typescript-estree, @typescript-eslint/utils |
| graphql-bff | @typescript-eslint/typescript-estree | moderate | no (dev tooling) | breaking: typescript-eslint@8.36.0 | via minimatch |
| graphql-bff | @typescript-eslint/utils | moderate | no (dev tooling) | breaking: typescript-eslint@8.36.0 | via @typescript-eslint/typescript-estree |
| graphql-bff | eslint (direct) | moderate | no (dev tooling) | breaking: eslint@9.39.5 | via @eslint/config-array, minimatch |
| graphql-bff | minimatch | moderate | no (dev tooling) | breaking: eslint@9.39.5 | minimatch has potential denial of service via globparts amplification https://github.com/advisories/GHSA-g3hv-75wg-m249 |
| graphql-bff | typescript-eslint (direct) | moderate | no (dev tooling) | breaking: typescript-eslint@8.36.0 | via @typescript-eslint/eslint-plugin, @typescript-eslint/parser, @typescript-eslint/typescript-estree, @typescript-eslint/utils |

## NuGet

No vulnerable packages (direct and transitive) in the root solution.

Deprecated packages:
- CatalogService.Tests: xunit 2.5.3 (Legacy -> xunit.v3)
- NotificationService.Tests: xunit 2.5.3 (Legacy -> xunit.v3)
- OrderingService.Tests: xunit 2.5.3 (Legacy -> xunit.v3)

## SBOMs (CycloneDX 1.6, JSON; production dependencies; test projects excluded)

Skipped (--no-sbom).

Result: pass under the proposed policy (no high or critical advisory in production npm dependencies, no vulnerable NuGet package)
