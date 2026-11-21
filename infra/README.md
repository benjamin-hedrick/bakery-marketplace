# Infrastructure

**Status (2026-11-21):** the `foundation` stack is applied in Azure (2026-11-20, from the lead's machine); the dev pipeline created and tore down the dev environment on 2026-11-20 (no apps deployed), and created, deployed and smoke-tested it on 2026-11-21 (build 88; still up when this was written). Evidence: `docs/evidence/WI-DEP-001/`. On 2026-11-21 the dev resources moved into a shared module so a UAT root can use the same code (`WI-DEP-002` step 2a); a plan of the moved code against the dev state showed 27 moves and nothing else.

| Path | What is there |
|---|---|
| `foundation/` | The persistent stack (ADR-0020): resource group, container registry, role assignments for pushing and pulling, a budget alert. Checked with `node scripts/ci/terraform-checks.mjs` (format, validate, mocked-provider tests); applied 2026-11-20. State is passed at init (`backend.hcl.example`; state key `foundation.tfstate`) |
| `modules/environment` | The disposable application environment (ADR-0020): Container Apps, Redis, Cosmos, Key Vault, Log Analytics, the seed job, the mock issuer. Every environment root calls it with its own values; its mocked-provider tests are in `tests/` |
| `environments/dev` | The dev root: the backend, the provider settings, dev's values (its name, group, Development host, the free-tier Cosmos) and the `moved` blocks of 2026-11-21; state key `dev.tfstate`, passed at init by the pipeline. The only root that may name itself `dev` |
| `otel-collector/` | OpenTelemetry Collector configurations: `local.yaml`, `local-jaeger.yaml` (used by the Compose profiles) and `cloud.yaml` (syntax-validated only) |
| `local/service.env.example` | Names of the environment variables a service needs when run on the host (no values) |

Every stack and the module are checked by `node scripts/ci/terraform-checks.mjs` (format, init without a backend, validate, and the mocked-provider tests). The images and a Compose profile that runs them exist (`docs/operations/local-dev.md`); the deployment path in Azure is not built; see `docs/architecture/tech-stack.md` and the register items on hosting and images.
