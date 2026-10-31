// Generates docs/product/backlog/TRACEABILITY.md: for every work item that has been built or is being built, the test files and the
// evidence records that name it (the traceability idea of a test-management tool, without the tool).
//
//   node scripts/docs/traceability.mjs           # write TRACEABILITY.md
//   node scripts/docs/traceability.mjs --check   # write nothing; exit 1 if TRACEABILITY.md is out of date
//
// "Names it" means the file contains the id (`ORD-005` or `WI-ORD-005`) as a whole word. A test file that does not mention an id is not
// counted, so the table shows where the link between a work item and its tests is missing; it does not prove coverage. Files come from
// `git ls-files`, so the result is the same on every machine.
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const backlog = path.join(root, 'docs', 'product', 'backlog');
const out = path.join(backlog, 'TRACEABILITY.md');
const check = process.argv.includes('--check');
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const tracked = execSync('git ls-files', { cwd: root, maxBuffer: 1 << 26 })
  .toString()
  .trim()
  .split('\n');
const isTest = (f) => /(^|\/)(tests?|__tests__)\//.test(f) && /\.(cs|ts|tsx|mjs)$/.test(f);
const testFiles = tracked.filter(isTest);
const evidenceFiles = tracked.filter((f) => f.startsWith('docs/evidence/') && f.endsWith('.md'));
const contents = new Map([...testFiles, ...evidenceFiles].map((f) => [f, read(path.join(root, f))]));

const BUILT = ['Done', 'Built', 'In review', 'In progress'];
const rows = [];
for (const f of readdirSync(backlog)
  .filter((n) => /^WI-[A-Z]+-\d+\.md$/.test(n))
  .sort()) {
  const text = read(path.join(backlog, f));
  const banner = /^> \*\*Status:\*\* (.+)$/m.exec(text.split('\n')[0]);
  if (!banner) continue;
  const status = BUILT.find((s) => banner[1] === s || banner[1].startsWith(s + ' '));
  if (!status) continue;
  const id = f.slice(3, -3);
  const title = /^Title:\s+(.+)$/m.exec(text)?.[1].trim() ?? '';
  const re = new RegExp(`(?<![A-Za-z0-9-])(?:WI-)?${id}(?![A-Za-z0-9-])`);
  const named = (files) => files.filter((g) => re.test(contents.get(g)));
  rows.push({ id, title, status, tests: named(testFiles), evidence: named(evidenceFiles) });
}

const cell = (files, shown = 3) => {
  if (!files.length) return '*none*';
  const base = (g) => `\`${g.split('/').pop()}\``;
  return files.slice(0, shown).map(base).join(', ') + (files.length > shown ? ` and ${files.length - shown} more` : '');
};
const done = rows.filter((r) => r.status === 'Done');
const withTests = done.filter((r) => r.tests.length);
const withEvidence = done.filter((r) => r.evidence.length);
const withNeither = done.filter((r) => !r.tests.length && !r.evidence.length);

const lines = [
  '# Traceability: work item to tests to evidence',
  '',
  `> **Status:** Generated · do not edit; \`node scripts/docs/traceability.mjs\` regenerates it and \`--check\` verifies it. Files are matched by naming the work item id as a whole word, so a missing entry means the link is not written down, not that nothing tests it, and a work item that is a document has no test by nature. Tests are the files under \`tests/\` and \`test/\` folders; evidence is \`docs/evidence/\`.`,
  '',
  `Of ${done.length} work items marked Done: ${withTests.length} are named by a test file, ${withEvidence.length} by an evidence record, ${withNeither.length} by neither.`,
  '',
  '| Item | Title | Status | Test files naming it | Evidence records naming it |',
  '|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| [${r.id}](WI-${r.id}.md) | ${r.title.replace(/\|/g, '/')} | ${r.status} | ${cell(r.tests)} | ${cell(r.evidence)} |`,
  ),
  '',
];
const next = lines.join('\n');

if (check) {
  const current = (() => {
    try {
      return read(out);
    } catch {
      return '';
    }
  })();
  if (current !== next) {
    console.error('TRACEABILITY.md is out of date: run node scripts/docs/traceability.mjs');
    process.exit(1);
  }
  console.log(`traceability check passed: ${rows.length} items`);
} else {
  writeFileSync(out, next);
  console.log(
    `wrote ${path.relative(root, out)}: ${rows.length} items; of ${done.length} Done, ${withTests.length} named by a test file, ${withEvidence.length} by an evidence record, ${withNeither.length} by neither`,
  );
}
