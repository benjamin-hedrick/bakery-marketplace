# scripts

Tooling that runs the project from outside. None of it is product code.

| Folder | What is in it |
|---|---|
| `ci/` | The gates and checks run before a push and in the pipeline: `node-gates.mjs`, `secret-scan.mjs`, `linux-check.mjs`, `terraform-checks.mjs`, `skeleton-smoke.mjs`, `test-report.mjs`, `repeat-suite.mjs`, and their tests in `ci/tests/` |
| `dev/` | Starting and exercising the local stack: `demo.mjs`, `init-env.mjs`, `check-env.mjs`, the Android flow runner `mobile-flows.mjs`, load and latency measurements, the demo film |
| `docs/` | Generating and checking the documentation: the status table, traceability, the scripts index |
| `lib/` | Code shared by the scripts above (the local stack, the flow-control server) |

Every script and command, with what it does and when to run it, is indexed in [`docs/operations/scripts.md`](../docs/operations/scripts.md);
`node scripts/docs/scripts-index.mjs --check` fails when a script is missing there. The local stack needs Docker; start with
[`docs/operations/local-dev.md`](../docs/operations/local-dev.md).
