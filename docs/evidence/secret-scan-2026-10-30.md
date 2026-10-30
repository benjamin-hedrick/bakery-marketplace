# Secret scan (2026-10-30)

> **Status:** Snapshot · 2026-10-30, `main` at `065293a`. Step 1 of the public-readiness pass (register item 93, `WI-SEC-004`). **Current result:** no real secret found in the tracked files or in the git history; four findings, all public or dummy values, are allowlisted in `.gitleaks.toml`.

## What was run

Tool: gitleaks (container `zricethezav/gitleaks:latest`, digest `sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f`), default rules, findings redacted, repository mounted read-only.

| Scan | Scope | Result |
|---|---|---|
| `gitleaks git --log-opts="--all"` | 153 commits reachable from every local and remote-tracking branch, 7.55 MB | 4 findings |
| Same, with `.gitleaks.toml` | Same | No leaks found |
| `gitleaks dir` | The working directory, including ignored files | 17 findings, all in git-ignored files (below) |

## The four history findings

| Rule | File | Verdict |
|---|---|---|
| generic-api-key | `scripts/ci/skeleton-smoke.mjs`, `infra/local/service.env.example`, `tools/tests/BakeryMarketplace.Data.Tests/CosmosRepositoryTests.cs` (3 hits) | The Cosmos DB emulator's documented, public, fixed account key. Not a secret. Confirmed by string match: the same value in all three. |
| stripe-access-token | `tools/tests/BakeryMarketplace.Secrets.Tests/SecretValidatorTests.cs` | `sk_test_123456…`, a placeholder in a configuration-shape test. Not a Stripe key. |

## The working-directory findings

The 17 `dir` findings are all files that git ignores and that are not in the repository or its history: the local `.env` (created by `scripts/dev/init-env.mjs`, holds the mock issuer's client secret) and generated Next.js build output (`.next/`, `.next-skeleton/`: preview keys). `git ls-files` lists no `.env`, `.pem`, `.pfx` or `.key` file.

## Limits

- One tool, default rules plus the allowlist. A scanner finds known patterns; it does not prove the absence of secrets.
- Only what is in this clone's refs was scanned. The GitHub repository was not inspected for other refs (for example closed pull request refs), forks or Azure DevOps variables.
- Not covered: personal data and material that is merely not meant for readers (step 4 of item 93), and the wording review of older commits (step 3).
- The local `.env` secret was never committed; it needs no rotation for this reason.
