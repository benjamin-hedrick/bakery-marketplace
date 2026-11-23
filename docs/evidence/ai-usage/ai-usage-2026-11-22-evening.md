# AI usage: one Claude Code session (2026-11-22 evening: dev-chaos evidence, DEV tracing built offline, teardown record)

> **Status:** Snapshot · 2026-11-22. Figures copied by the project lead from the usage screen of Claude Code. They were not measured by the repository or checked independently, and the screen labels them approximate. Cost is a **relative cost**: the screen's figure divided by a base of 2.00, to two decimals (register 175). Wall time is not recorded (register 175). They were read before this record was written and committed; the push that follows is not in them.

## What was recorded

| | Session 2026-11-22 evening (`feature/dev-chaos-evidence`) |
|---|---|
| Relative cost (screen cost ÷ 2.00) | 2.63 |
| API time | 14 min 11 s |
| Lines added / removed (the screen's count) | 765 / 101 |
| Main model (Sonnet 5.5): tokens | 364 input, 118.7k output, 29.9M cache read, 270.1k cache write |
| Main model relative cost | 2.63 |
| Small model (Haiku 5.5) relative cost | 0.00 (1.2k input, 128 output) |
| Requests to the main model; share of input served from the prompt cache | 170; 99% |
| Prompt cache misses | none |
| Subagents | none |
| Plan at the reading | current session 12% used; current week, all models, 82% used (resets Nov 24, 5:59pm America/New_York) |

## What the session did

- **The first deployed `dev-chaos` run read from the build logs** (build 117, through the lead's Azure DevOps sign-in; the artifact download is still blocked): 15 passed, 1 skipped (the concurrency test, sold-out lemonade on a long-lived environment); the observe counts of faults; a latency table from the agent and one from the lead's machine. The record is `docs/evidence/WI-CHAOS-006/dev-chaos-deployed-2026-11-22.md`; open questions are register 236.
- **A wrong statement corrected within the session:** the first version of that record said the cache Redis was off; checking Azure afterwards showed the pipeline's `cacheRedis` default had put it back.
- **Test 11 and a vendor reset:** looked at and not built (a vendor login on DEV's public issuer needs the issuer's role switch and an IP allow-list the agent's smoke cannot satisfy); the lead chose to run it on a fresh create.
- **`WI-OBS-001` written and steps 1 to 5 and 7 built offline:** Terraform for Application Insights and an OpenTelemetry collector app, the connection string as a post-apply Key Vault secret, the collector's restart in the deploy step, the apps' OTLP settings, a `tracing` input in the dev pipeline, and the observe stage's span queries with a wait for ingestion. Checked with the Terraform checks, the script unit tests, the node gates and the collector run in Docker; **nothing was applied to Azure**, and the spec says what is unproved.
- **A defect found by running the collector:** with the plain "set-after-apply" placeholder its exporter exits at start; the placeholder for that one secret is now a well-formed all-zero-key string.
- **Teardown read back:** the lead ran both destroys; the agent confirmed both groups empty, the foundation intact, no Container Apps environment left and both vaults soft-deleted, and wrote the record. The stale `WI-DEP-001` and `WI-DEP-002` banners were rewritten.

## Errors the assistant made, and what caught them

- **Register 201 (48):** files and scripts written through shell heredocs several times against the CLAUDE.md rule, after reading it at the start; no content was lost. Found by the assistant on rereading its own commands, not by a check.
- The cache Redis misstatement above, caught by the assistant's own check of the running environment before the lead relied on it.
- Edits that failed on non-unique text and on formatter-changed spacing, caught by the tool and by `terraform fmt` in the checks.

## How to read the numbers

- **Relative cost is a size, not a price.** 2.63 is a small session by this table: logs read, a work item and its offline build, records.
- **The model differs from the previous record** (Sonnet 5.5 here, Opus 5.5 there), so the two figures are not like for like.
- **Most of the elapsed time was the lead's pipeline runs and destroys;** the screen's API time counts the assistant only.
- **No claim is made about value per unit of cost.** The human review time is not in these figures.
