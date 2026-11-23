> **Status:** Ready · created 2026-11-23 from the lead's decision on register 162 point (4); split out of `WI-SEC-004`

```
WI ID:                SEC-007
Title:                A container image scan: a local script that runs Trivy in Docker, run once and recorded
Type:                 Document/Artifact
Epic:                 EPIC-CI-CD
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Ready
Size:                 S
Verification class:   V1 (a script and a recorded run). The classes are proposed in `docs/process/verification-policy.md` (register item 130).
```
ADRs and NFRs affected: ADR-0020 (container images), `nfrs.md` section 3 (supply chain). No ADR changes.

**Context / Why**
`WI-SEC-004` ran a dependency audit and a secret scan but never scanned the container images (register 162 point 4; the Dockerfiles and the Compose images). On 2026-11-23 the lead decided to add an image scan as a local script like `scripts/ci/secret-scan.mjs`, run it once and record the result. A pipeline job is decided only after seeing what it finds.

**Inputs / References**
- *Decisions*: register 162 (the lead's decision of 2026-11-23); ADR-0020.
- *Environment/tooling*: `scripts/ci/secret-scan.mjs` (the pattern: a pinned image run in Docker), the Dockerfiles under `services/` and `apps/`, `docker-compose.yml`.
- *References*: `docs/evidence/WI-SEC-004/` (where the dependency audit record is).

**You do not need to know about**
- The pipeline's structure and the Terraform stacks.

**Out of scope**
- A pipeline job for the scan: decided after the first result, as its own change.
- The dependency audit job: `WI-SEC-006`.
- Fixing a finding: each is its own change; the record lists them.

**Requirements / Acceptance Criteria**
1. `scripts/ci/image-scan.mjs` builds (or uses) each image the repo's Dockerfiles define and scans it with Trivy run in Docker, with the Trivy image pinned by digest or exact version. It scans the Compose-pulled third-party images too (Redis, the Cosmos emulator, the mock issuer's base).
2. The script exits 1 on a high or critical finding with a fix available, 2 when a scan could not run (an image that could not be built or pulled is not a pass), 0 otherwise. Unfixed and lower findings are reported, not failed.
3. The script writes a summary and the tool's raw output under `docs/evidence/WI-SEC-007/` (the raw part is committed only if it is small; otherwise the record says where it was and why it is not kept).
4. The first run is recorded in `docs/evidence/WI-SEC-007/image-scan-<date>.md` with each image, the counts per severity, and what the lead decides next. Findings that need a decision go in the open-items register in the same change.
5. A script test covers the exit-code logic on a canned Trivy JSON (no Docker needed); `docs/operations/scripts.md` lists the script; gap row `G-E09` is updated.

**Dependencies**
- Blocks: nothing.
- Blocked by: none.
- Can be worked in parallel with: `WI-SEC-006`.

**Verification**
Class V1. The exit-code test runs with the unit tests; the scan itself needs Docker and the network, and is reported as run only with its record.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Full. Flag, do not choose: upgrading a base image or any dependency to clear a finding; adding a pipeline job.

**Open Points**
- [ ] Whether a pipeline job follows, and whether it blocks: the lead decides after reading the first record.
