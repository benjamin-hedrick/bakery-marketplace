# Security policy

## What this repository is

A portfolio project: a pickup-based bakery and coffee marketplace, built to show architecture and engineering practice. **Nothing is deployed.** Everything runs locally, with a mock identity issuer, test payments and seeded data. There is no production system, no real customer data and no real payment provider behind it.

## Reporting a vulnerability

If you find a security problem in the code, the configuration or the documentation, please report it privately and do not open a public issue.

- Use GitHub's **private vulnerability reporting**: the "Report a vulnerability" button on the repository's Security tab.
- Include what you found, where (file and line, or the steps to reproduce) and what you think the impact is.

This is a one-person project, so there is no service level. I will aim to acknowledge a report within a week and to say what I will do about it.

## What is in scope

- Flaws in the shared libraries and services: authentication and ownership checks, input validation, rate limiting, session handling, the browser hardening headers.
- Secrets or personal data committed to the repository by mistake.
- Dependencies with a known vulnerability that the dependency audit missed.

## What is not in scope

- The mock OIDC issuer, the seeded customers and the local test credentials: they are meant for local use only and are documented as such.
- Anything that needs a deployment that does not exist.
- Findings from an automated scanner without a demonstrated impact.

## What the repository already does

The threat model, the scans that have been run (secret scan over the full history, dependency audit, SBOMs, an OWASP ZAP baseline) and their results are recorded, with their limits, in [the threat model](docs/architecture/threat-model.md) and the evidence folder (`docs/evidence/`). Please read them before reporting a known limitation.

## Supported versions

Only the `main` branch is maintained.
