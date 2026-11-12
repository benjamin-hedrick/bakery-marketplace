# Contributing

This is a single-maintainer reference project. It runs on a developer machine only; nothing is deployed. The [README](README.md) says what it is and how to run it, and [docs/index.md](docs/index.md) is the map of the documents.

## Conduct

Participation is under the [Code of Conduct](CODE_OF_CONDUCT.md).

## Questions and issues

Questions and issues are welcome. Please look at the README and the documents first; the [open-items register](docs/governance/open-items-register.md) lists what is already known and its status.

## Pull requests

Pull requests may not be merged. The project follows its own plan ([current plan](docs/product/backlog/current-plan.md)) and one maintainer merges. A small fix, such as a broken link or a documented claim that the code or the evidence does not support, is the most likely to be accepted. For anything larger, please open an issue before writing code.

## Security problems

Please do not open a public issue for a vulnerability. Use **Report a vulnerability** on the Security tab; see [SECURITY.md](SECURITY.md).

## If you send a change

- It belongs to a work item or a register item, and the message says which.
- It includes tests, and its results are reported as passed, failed, skipped or not run, never merged into one "ok".
- It contains no secrets.
- Decision records are never rewritten: they are amended by a dated note at the end, and the status line says what is current ([status and supersession](docs/method/status-and-supersession.md)).
- The checks pass on your machine before you push: `node scripts/ci/node-gates.mjs` and `node scripts/ci/secret-scan.mjs` (add `--tests` to the first for code changes). Every script and command is indexed in [scripts](docs/operations/scripts.md); the branching rules are in [branching strategy](docs/process/branching-strategy.md).

Parts of this repository were written with an AI assistant. [AI collaboration](docs/method/ai-collaboration.md) describes the controls, and a change that was written with an assistant should say so.
