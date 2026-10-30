# Writing rules: hard invariants and guided defaults

> **Status:** Current · written 2026-10-30. A convention for how rules, checklists and standards in this repository are written, and a classification of the main rules that exist today. The rules in `CLAUDE.md` and the other documents are not yet marked with these kinds; marking them needs the lead's approval for `CLAUDE.md` (proposed at the end).

Not every rule is the same strength, and treating them the same causes two failures: a default is applied rigidly where judgment would do better, or an invariant is argued away as if it were a default. Every rule here is written as one of two kinds, stated up front.

- **Hard invariant.** No judgment, no exceptions. Wherever possible it is paired with a check that a machine runs (a test, a lint rule, a script, a CI step) instead of trusting memory. If a hard invariant needs an exception, the rule is wrong or must be changed by a decision (an ADR note, a change to the rule), not bypassed.
- **Guided default.** A strong default that judgment may depart from, **if the departure is stated and justified** where the next reader will see it. A departure is a decision, not a violation.

Every rule also names **how it is verified**, so that the guidance (what to do) and the check (how to know it was done) cannot drift apart as two separate documents.

## How to write a rule

`Hard:` or `Default:` first, then the rule, then `Verify by:` and who may approve a departure (for a default).

Verification is one of: **automated** (a test, lint rule or CI step fails), **generated or checked by a script** (for example the status check), **review** (a person reads it against the rule), or **not yet** (a gap, which is recorded in the register). "Review only" is acceptable for a default; for a hard invariant it is a gap to close.

A departure from a default is recorded where it will be found: an open point on the work item, a dated note on the ADR, or the commit message that makes it.

## The main rules, classified

State on 2026-10-30. The right-hand column is the honest part.

| Rule | Kind | Verified by | State |
|---|---|---|---|
| All Cosmos access uses parameterized SDK queries; no raw query strings (`nfrs.md` 3.4) | Hard | Review | Not automated; a lint rule or code search could close it |
| No secrets in files | Hard | A git-ignored `.env`; secret validation tests; review | No secret scan of files or history yet (register 93) |
| Test hooks are inert in Production; `ENABLE_TEST_HOOKS` is never set outside tests | Hard | Tests of the Production case; configuration | Automated for the payment hook; the flag is by convention |
| Every service validates the token and ownership itself, whatever sits in front (zero trust, ADR-0006, ADR-0008) | Hard | Auth integration tests; real-stack journeys that send forged and wrong-role tokens | Partly automated; one gap found (register 85, issuer validation) |
| No token, key or secret in a log line or an exported span | Hard | A log test in the BFF; a regression test on the catalog span; a one-time scan of exported spans | Partly automated |
| Money is integer cents; the server computes the price, never the client | Hard | Pricing and checkout tests | Automated |
| Order and cart data are never cached (ADR-0014) | Hard | Review; no cache is used by any service yet | Not automated |
| A decision record's decision text is never edited | Hard | Reading the diff | Not automated |
| Every spec has a status banner and the status table is current | Hard | `node scripts/docs/status.mjs --check` | A script exists; not enforced anywhere (register 90) |
| Do not describe anything as working unless it was run; report passed, failed, skipped and not run separately | Hard | Review; the results summarizer keeps the counts separate | Partly automated |
| Security, auth logic, IAM and RBAC changes and scope expansion need the lead's approval (`CLAUDE.md`) | Hard | The assistant stops; the lead reviews | A process rule; nothing enforces it mechanically |
| Authenticated or personalized responses are `private, no-store` unless a reviewed policy shows otherwise (ADR-0014) | Default | Review; browser and BFF tests for the cases built | Departure needs a reviewed policy |
| A work item's references are bounded to about three to five; split an item that needs more (Definition of Ready) | Default | Review at the Ready check | Departure stated in the item |
| One commit per work item; themed branches; rebase before pushing | Default | Review | Departure stated in the commit or PR |
| A fix is accepted after repeated runs ("five in a row") | Default | The run results | A rule of thumb, not a statistic |
| Prefer removing a secret to managing it well (managed identity over a stored secret, ADR-0007) | Default | Review of each new secret | Departure stated in the ADR or spec |
| Use a fake for fast unit tests and the real dependency for integration | Default | Contract tests run against both | The silent fallback of some tests to fakes is a defect of this rule (see [patterns](../architecture/patterns.md), "Two meanings of fallback") |
| A flaky test is fixed, not retried; quarantine only with an owner, a reason and a review date | Hard when it applies | Review; none are quarantined | Not automated |

## Where this stands and what is proposed

The kinds are not marked in `CLAUDE.md`, `quality-gates.md`, `engineering-standards.md` or the ADRs. Proposed, for the lead's approval because it edits `CLAUDE.md`: prefix each rule there with `Hard:` or `Default:` and add `Verify by:`, then do the same in the process documents; and for every hard invariant whose verification is "review" or "not yet", decide whether to add a check or accept the gap. Closing those gaps overlaps register items 85, 90 and 93.

## Related

[Surprise rule](surprise-rule.md) · [patterns](../architecture/patterns.md) · [quality gates](../process/quality-gates.md) · [lessons](lessons.md)
