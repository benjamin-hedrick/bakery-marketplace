# Secret scan and sanitization search (2026-11-08)

> **Status:** Snapshot · 2026-11-08, branch `feature/docs-front-door` at `062977e`. Step 1 of the pre-publish pass (register item 93, `docs/governance/pre-publish-gaps.md`). **Current result:** no leak found in the git history; no key, certificate, state or environment file is tracked; local paths were found in five records and removed; the author name and e-mail address on every commit were reviewed and accepted by the lead.

## What was run

`node scripts/ci/secret-scan.mjs` (gitleaks in a container, `.gitleaks.toml`, which allowlists only the Cosmos emulator's published account key and the placeholder `sk_test_123456` in a test). Scope: every commit reachable from every local and remote-tracking branch.

| Check | Result |
|---|---|
| gitleaks over the full history | **426 commits, 12.41 MB, no leaks found** (25.6 s) |
| Tracked files named like a secret (`.env`, `.pem`, `.pfx`, `.key`, `.p12`, `.tfstate`, `.tfvars`) | None except `*.tfvars.example` and the `staging` and `prod` `terraform.tfvars`, which hold only resource names; every tenant or subscription GUID in the tree is a zero-filled placeholder |
| Files of that kind deleted in the history | An old dev `terraform.tfvars` (resource names only) and committed `bin/` and `obj/` output of the Secrets tool (build output) |
| `.env` | Git-ignored; never committed |
| E-mail addresses in the tree | Seed and test addresses only (`*.local`, `*.test`, `example.test`) |
| Commit authors | One person and one address on every commit (`git log --all`; a few commits are authored or committed through GitHub's web interface); accepted by the lead (the `LICENSE` names the same person) |
| Windows paths and the Windows user name (tree and history) | Found in five records: the two raw NuGet outputs in `docs/evidence/WI-SEC-004/raw/`, `docs/evidence/test-reliability/findings.md`, `docs/history/review-2026-10/60-resume-here.md` and `peer-copy-in-register.md`. Replaced with relative or home-relative paths in the working tree; **the earlier commits still contain them** (the history is not rewritten) |
| Employer, client or colleague names | Not searched for: none were supplied. The peer repositories are already labelled peer-A to peer-C (`docs/history/README.md`) |
| `_incoming/` | Not in the tree; present only in two early commits |

## Limits

- One tool, default rules plus the two-value allowlist: a scanner finds known patterns and does not prove the absence of secrets. Only this clone's refs were scanned; the hosted repository's other refs, forks and pipeline variables were not.
- Container images and a pipeline's variables are not covered.
- The search for personal data is a set of patterns (e-mail addresses, Windows paths, the author's names), not a reading of every file.
