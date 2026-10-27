# ADR: CI/CD system of record

-   **Status:** Proposed for adoption
-   **Decision:** GitHub remains source control; Azure DevOps Pipelines
    is the single authoritative CI/CD system.

Start with format/lint/type/build validation, unit tests,
schema/contract checks, and useful diagnostics. Add integration,
Playwright, security checks, deployment gates, and post-deploy smoke
tests when dependencies exist. Use least privilege, federated identity
where supported, and separate CI/deploy permissions. Never commit
secrets.

Do not remove `.github/workflows/ci.yml` until ADO works, required
checks/branch protection are migrated, and docs identify the
authoritative pipeline. Then remove/replace the placeholder in one
explicit migration.
