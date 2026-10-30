# Infrastructure

**Status (2026-10-30): mostly empty; nothing has been planned or applied.**

| Path | What is there |
|---|---|
| `modules/key_vault` | A Terraform module for Key Vault. Never planned or applied |
| `environments/dev`, `staging`, `prod` | Per-environment folders for configuration; no cloud environment exists |
| `otel-collector/` | OpenTelemetry Collector configurations: `local.yaml`, `local-jaeger.yaml` (used by the Compose profiles) and `cloud.yaml` (syntax-validated only) |
| `local/service.env.example` | Names of the environment variables a service needs when run on the host (no values) |

The deployment path (hosting, images, a Terraform dev environment) is not built; see `docs/architecture/tech-stack.md` and the register items on hosting and images.
