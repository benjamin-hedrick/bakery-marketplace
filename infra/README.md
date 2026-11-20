# Infrastructure

**Status (2026-11-20): the `foundation` stack is applied in Azure (2026-11-20, from the lead's machine); `environments/dev` has been planned (locally as the lead, and by the dev pipeline's read-only plan step) and never applied.** Evidence: `docs/evidence/WI-DEP-001/foundation-apply-and-first-plan-2026-11-20.md`.

| Path | What is there |
|---|---|
| `foundation/` | The persistent stack (ADR-0020): resource group, container registry, role assignments for pushing and pulling, a budget alert. Checked with `node scripts/ci/terraform-checks.mjs` (format, validate, mocked-provider tests); applied 2026-11-20. State is passed at init (`backend.hcl.example`; state key `foundation.tfstate`) |
| `environments/dev` | The disposable environment stack (ADR-0020): Container Apps, Redis, Cosmos, Key Vault, Log Analytics; same checks as `foundation`; planned, never applied (state key `dev.tfstate`, passed at init by the pipeline) |
| `otel-collector/` | OpenTelemetry Collector configurations: `local.yaml`, `local-jaeger.yaml` (used by the Compose profiles) and `cloud.yaml` (syntax-validated only) |
| `local/service.env.example` | Names of the environment variables a service needs when run on the host (no values) |

The dev environment stack (Container Apps, Redis, Cosmos, Key Vault, the mock issuer) is written and checked with mocked providers only (`docs/evidence/WI-DEP-001/environment-stack-2026-10-31.md`); the deploy and destroy pipeline stages are not built. The images and a Compose profile that runs them exist (`docs/operations/local-dev.md`); the deployment path in Azure is not built; see `docs/architecture/tech-stack.md` and the register items on hosting and images.
