# WI-PORT-004 --- Cache contract for listing path

**Prerequisites:** cache ADR adopted; listing contract and
freshness/invalidation triggers identified. One owner.

Identify which of the three layers are active. Set HTTP policy
deliberately; define Relay update/refetch behavior; default to no
server-side cache absent a demonstrated need; add stale-state and
authorization-isolation tests.

Acceptance: each active cache has owner, scope/key, freshness,
invalidation, failure behavior, privacy classification, and test.
Personalized data is not publicly cached. Any proposed cache technology
names its use case and measurement plan.
