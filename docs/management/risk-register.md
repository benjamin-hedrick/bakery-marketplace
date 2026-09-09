# Risk Register

Every technical risk here traces to a specific ADR or `docs/governance/open-items-register.md` entry — this document reformats them into a prioritized, likelihood/impact view for planning purposes; it does not replace the open items register as the source of remediation detail. Likelihood/Impact ratings are proposed defaults (qualitative High/Medium/Low), not measured — confirm or adjust per `WI-MGMT-002`'s Open Points.

| ID | Risk | Category | Likelihood | Impact | Response / Mitigation | Source |
|---|---|---|---|---|---|---|
| R-01 | Chargeback/dispute handling is deferred — a real dispute has no handling workflow in v1 | Business/Compliance | Medium | Medium | Documented deferral (ADR-0005); revisit if real transaction volume ever justifies the buildout | ADR-0005, Open Item #6 |
| R-02 | Cosmos DB's shared 1,000 RU/s budget creates noisy-neighbor risk across containers | Technical/Scalability | Low (at current target load) | Medium | Monitor via `OPS-003`; per-container throughput provisioning is the escalation path if it becomes real | ADR-0004, Open Item #3 |
| R-03 | No network-level enforcement that APIM is the only path to backend services (Consumption tier lacks VNet/Private Link) | Technical/Security | Low | Medium (mitigated) | Zero-trust dual validation (ADR-0006/0008) means a bypass loses optimizations, not auth enforcement | ADR-0008 |
| R-04 | Cosmos partition-key choices are v1 guesses, unvalidated under real load | Technical/Scalability | Medium | Medium | Requires a documented migration if wrong, not just a config change; revisit after initial load testing | ADR-0004, Open Item #5 |
| R-05 | Redis Basic tier requires an unavoidable access-key secret (no AAD auth at that tier) | Technical/Security | Low | Low | Accepted; documented upgrade path to a higher tier if ever justified | ADR-0002, Open Item #1 |
| R-06 | No centralized authorization policy engine — per-service ownership checks could drift as role/resource complexity grows | Technical/Maintainability | Low (at current scope) | Medium | Deferred by design; OPA or similar named as the v2 escalation path | ADR-0006, Open Item #8 |
| R-07 | Secrets rotation requires a service restart — no live rotation | Technical/Operability | Low | Low | Accepted; Key Vault's automatic rotation policies are the named v2 enhancement | ADR-0007, Open Item #9 |
| R-08 | Single-region/single-currency assumption — real rework needed for international support | Business/Scalability | Low (out of current scope) | Medium (if scope ever expands) | Explicitly named as deferred, not silently assumed | ADR-0005, Open Item #7 |
| R-09 | Legal artifacts (Terms of Service, Privacy Policy) — in/out decision still not made | Business/Compliance | Medium | Medium | Tracked as `GOV-002`; needs an explicit decision, not continued silence | `MASTER-BACKLOG-OUTLINE.md` GOV-002 |
| R-10 | Backlog size (~33 epics) relative to likely solo/small-team pace — real schedule risk of scope never completing | Project/Schedule | **High** | Medium | This project plan's phased structure and the MVP-line legend exist specifically to keep a demoable subset always achievable even if later phases slip; revisit phase entry/exit criteria if pace proves slower than expected | `docs/management/project-plan.md`, `portfolio-plan.md`'s MVP legend |
| R-11 | Bounded-context-to-service mapping was decided late (after scaffolding, not before) — a process gap that could recur elsewhere if not watched | Project/Process | Low (mitigated) | Low | Root-cause process fix already landed in `project-process-framework` (Phase 4 requirement, checklist item, named pattern) — this specific risk is closed, listed here for visibility, not as an open concern | ADR-0009 |

## Notes

- **R-10 is the one risk on this list not already captured elsewhere** — it's a genuine project-management-level risk (schedule/scope), not a technical one, and wouldn't surface from an architecture review alone. It's rated High likelihood deliberately: a ~33-epic backlog is large relative to typical solo/small-team portfolio-project pace, and this register should say so plainly rather than understate it.
- Risks rated Low/Low are listed for completeness and traceability, not because they need active attention right now — the register's value is in having all of them in one place with a source, not in treating every row as equally urgent.

## Related

- `docs/governance/open-items-register.md` — source of most technical entries; consult it for remediation detail, not this table
- `docs/management/project-plan.md` — R-10's mitigation approach (phased, MVP-line-protected)
