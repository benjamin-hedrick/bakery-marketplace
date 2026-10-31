# Infrastructure

**Status (2026-10-31): two stacks written and checked locally (`foundation`, `environments/dev`); nothing has been planned or applied against Azure.**

| Path | What is there |
|---|---|
| `foundation/` | The persistent stack (ADR-0020): resource group, container registry, role assignments for pushing and pulling, a budget alert. Checked with `node scripts/ci/terraform-checks.mjs` (format, validate, mocked-provider tests); never planned against Azure. State is passed at init (`backend.hcl.example`) |
| `modules/key_vault` | A Terraform module for Key Vault. Never planned or applied |
| `environments/dev` | The disposable environment stack (ADR-0020): Container Apps, Redis, Cosmos, Key Vault, Log Analytics; same checks as `foundation`; never planned or applied |
| `environments/staging`, `prod` | Old placeholder folders (azurerm 3.x); to become `uat` and `prod` in the promotion design, not checked |
| `otel-collector/` | OpenTelemetry Collector configurations: `local.yaml`, `local-jaeger.yaml` (used by the Compose profiles) and `cloud.yaml` (syntax-validated only) |
| `local/service.env.example` | Names of the environment variables a service needs when run on the host (no values) |

The dev environment stack (Container Apps, Redis, Cosmos, Key Vault) is written and checked with mocked providers only (`docs/evidence/WI-DEP-001/environment-stack-2026-10-31.md`); the deploy and destroy pipeline stages are not built. The images and a Compose profile that runs them exist (`docs/operations/local-dev.md`); the deployment path in Azure is not built; see `docs/architecture/tech-stack.md` and the register items on hosting and images.
