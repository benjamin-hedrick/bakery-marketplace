# Infrastructure

**Status (2026-10-31): one stack written and checked locally (`foundation`); nothing has been planned or applied against Azure.**

| Path | What is there |
|---|---|
| `foundation/` | The persistent stack (ADR-0020): resource group, container registry, role assignments for pushing and pulling, a budget alert. Checked with `node scripts/ci/terraform-checks.mjs` (format, validate, mocked-provider tests); never planned against Azure. State is passed at init (`backend.hcl.example`) |
| `modules/key_vault` | A Terraform module for Key Vault. Never planned or applied |
| `environments/dev`, `staging`, `prod` | Per-environment folders for configuration; no cloud environment exists |
| `otel-collector/` | OpenTelemetry Collector configurations: `local.yaml`, `local-jaeger.yaml` (used by the Compose profiles) and `cloud.yaml` (syntax-validated only) |
| `local/service.env.example` | Names of the environment variables a service needs when run on the host (no values) |

The environment stack (Container Apps, data, Key Vault) is not written. The images and a Compose profile that runs them exist (`docs/operations/local-dev.md`); the deployment path in Azure is not built; see `docs/architecture/tech-stack.md` and the register items on hosting and images.
