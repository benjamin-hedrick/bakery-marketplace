#!/usr/bin/env node
// Generates the local development secrets into the git-ignored `.env` at the repository root (ADR-0007, ADR-0018, WI-AUTH-006).
//
//   node scripts/dev/init-env.mjs            create any missing secret, keep existing ones
//   node scripts/dev/init-env.mjs --rotate   replace every managed secret with a new one (restart the mock issuer and services after)
//
// Values are random and never printed or committed. `docker compose` reads `.env` automatically; services run on the host take the
// value from there (docs/operations/local-dev.md). Exit code 0 on success.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const envPath = path.join(root, '.env');

// Keys this script manages. Add a key here when another service client needs a secret.
const managed = [
  { key: 'ORDERING_CLIENT_SECRET', note: 'client secret of ordering-service for the mock issuer (ADR-0018)' },
  {
    key: 'SESSION_ENCRYPTION_KEY',
    note: 'key that encrypts browser sessions held in Redis by the web apps (ADR-0019)',
  },
];

const rotate = process.argv.includes('--rotate');
const newSecret = () => randomBytes(32).toString('base64url');

const original = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
let lines = original === '' ? [] : original.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
const report = [];

for (const { key, note } of managed) {
  const pattern = new RegExp(`^${key}=(.*)$`);
  const index = lines.findIndex((line) => pattern.test(line));
  const current = index >= 0 ? pattern.exec(lines[index])[1].trim() : '';
  if (current.length >= 16 && !rotate) {
    report.push(`${key}: kept`);
    continue;
  }
  const entry = `${key}=${newSecret()}`;
  if (index >= 0) {
    lines[index] = entry;
  } else {
    if (lines.length > 0 && lines.at(-1) !== '') lines.push('');
    lines.push(`# ${note}`, entry);
  }
  report.push(`${key}: ${current ? 'replaced' : 'created'}`);
}

const next = lines.join('\n') + '\n';
if (next !== original.replace(/\r\n/g, '\n')) {
  writeFileSync(envPath, next, { mode: 0o600 });
  try {
    chmodSync(envPath, 0o600);
  } catch {
    // not supported on every platform; the file is git-ignored either way
  }
}

console.log(`${envPath}`);
for (const line of report) console.log(`  ${line}`);
console.log('Values are not shown. `.env` is git-ignored; never commit it.');
