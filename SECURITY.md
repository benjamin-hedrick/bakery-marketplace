# Security policy

This is a demonstration and reference project. It runs on a developer machine only: nothing is deployed, there are no real users, no real payments, and the identity provider is a local mock. Even so, a report is welcome if you find a vulnerability in the code, the configuration or the documentation, such as a secret that should not be there.

## How to report

Please do not open a public issue for a security problem. On the repository's **Security** tab, choose **Report a vulnerability** to send a private report to the maintainer. If that button is not shown, open an issue that says only that you have a security report, without details, and the maintainer will arrange a private channel.

## What to expect

This is a one-person project with no service level. A report will be read and answered on a best-effort basis, and a confirmed problem will be fixed or recorded in `docs/governance/open-items-register.md`.

## Scope and known limits

The local development secrets and the Cosmos DB emulator's published key are not secrets; see `docs/evidence/secret-scan-2026-10-30.md`. Known gaps (service-to-service authentication beyond the local phase, the mock issuer, the payment stub) are recorded in the register and the ADRs. Locally, ordering calls catalog with OAuth2 client credentials against the mock issuer (ADR-0018, phase 1, `WI-AUTH-006`); the credential type for a deployed environment is not settled and nothing is deployed.
