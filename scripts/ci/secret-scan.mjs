#!/usr/bin/env node
// Scans the full git history (every ref) for secrets with gitleaks, using .gitleaks.toml. Findings are redacted.
// The pipeline's `secrets` job (azure-pipelines.yml) runs this same script, so the image and flags live here only.
//
//   node scripts/ci/secret-scan.mjs
//
// Run it before every push. Scans COMMITTED history: commit first. Needs Docker; the first run pulls the image.
// Exit code 0 when nothing is found, 1 when gitleaks reports a finding, 2 when the scan itself could not run.
// Rules and the allowlisted public/dummy values: .gitleaks.toml. Record of the first scan: docs/evidence/secret-scan-2026-10-30.md.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Pinned by digest so a new gitleaks release cannot change the result unnoticed. Update deliberately.
const image = 'zricethezav/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f';

const args = ['run', '--rm'];
// On Linux the container user must own the mounted files or git refuses the repository ("dubious ownership").
if (process.platform !== 'win32') args.push('--user', `${process.getuid()}:${process.getgid()}`);
args.push(
  '-v',
  `${root}:/repo:ro`,
  image,
  'git',
  '/repo',
  '--config',
  '/repo/.gitleaks.toml',
  '--redact',
  '--no-banner',
);

const r = spawnSync('docker', args, { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
if (r.error || r.status === null || r.status > 1) {
  console.error('secret scan could not run (is Docker running?):', r.error?.message ?? `exit ${r.status}`);
  process.exit(2);
}
process.exit(r.status);
