#!/usr/bin/env node
// Keeps docs/operations/scripts.md honest: every script under scripts/ (not the tests) must be named there by its path, so a new script cannot be added
// without a row. It checks that the page names the file, not that the row is correct: what a script does is in its header and on the page.
//
//   node scripts/docs/scripts-index.mjs            list the scripts that are missing from the page
//   node scripts/docs/scripts-index.mjs --check    the same, and exit 1 when there is one
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const page = readFileSync(path.join(root, 'docs', 'operations', 'scripts.md'), 'utf8');

function scripts(dir) {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === 'tests' ? [] : scripts(rel);
    return e.name.endsWith('.mjs') ? [rel] : [];
  });
}

const missing = scripts('scripts').filter((s) => !page.includes(s));
if (missing.length === 0) {
  console.log(`scripts index: every script is named in docs/operations/scripts.md`);
} else {
  console.log(`scripts index: ${missing.length} script(s) are not named in docs/operations/scripts.md:`);
  for (const s of missing) console.log(`  ${s}`);
  if (process.argv.includes('--check')) process.exit(1);
}
