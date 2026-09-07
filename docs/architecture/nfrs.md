# Non-Functional Requirements

_TODO: scalability targets, security/compliance assumptions (allergy data handling), availability targets feeding the SLA. Must explicitly cover: the zero-trust posture (`docs/product/vision.md` principle 5), CSRF exposure analysis (see ADR-0006's token-storage note — likely N/A under the current header-only design, but state that explicitly rather than by omission), and injection-protection baseline (parameterized/ORM-based data access, no raw query construction). See `WI-NFR-001.md` for the full required-content breakdown._
