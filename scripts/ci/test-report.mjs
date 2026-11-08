#!/usr/bin/env node
// Runs the unit and service test suites once and reports, per suite, how many tests ran, passed, failed and were skipped, and how much of the product code
// they executed (line coverage). The counts come from the run itself, not from a count of test names, so a skipped test is never a pass.
//
//   node scripts/ci/test-report.mjs [--only <name,name>] [--skip-dotnet] [--skip-js] [--write]
//
//   --only        run only suites whose name contains one of these words (for example: ordering,bff)
//   --write       also write docs/evidence/test-and-coverage-<date>.md (the dated, commit-stamped record)
//
// What it runs: every .NET test project (tools/tests/*, services/*/tests/*) with coverlet's collector and a TRX log; the JavaScript suites that use
// `node --test` (graphql-bff, customer-core, web-session, mobile-customer, web-queue-display unit) with Node's built-in coverage. It only LISTS the Playwright suites
// (counts, not run: they need a built app and servers, see repeat-suite.mjs and skeleton-smoke.mjs) and counts the Maestro flows.
//
// Coverage is LINE coverage. For .NET the reports of all projects are merged by file and line, so a library covered from two test projects counts once and
// a line counts as covered if any project ran it. The Redis and Cosmos tests run only when REDIS_CONNECTION_STRING and COSMOS_CONNECTION_STRING are set (and the
// containers are up); the report says which mode it ran in, because the skipped tests change both the counts and the coverage.
// Test tooling: it runs the suites from outside and adds nothing to the product code. Takes several minutes (about ten with the containers up).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const only = opt('--only', '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const wanted = (name) => only.length === 0 || only.some((o) => name.toLowerCase().includes(o));
const log = (m) => console.log(`[report] ${m}`);
const work = path.join(root, 'artifacts', 'coverage');
const isWin = process.platform === 'win32';

// ---- .NET -------------------------------------------------------------------------------------------------------------------------------------------------
function dotnetProjects() {
  const found = [];
  const add = (dir) => {
    if (!existsSync(dir)) return;
    for (const d of readdirSync(dir, { withFileTypes: true }))
      if (d.isDirectory()) {
        const proj = path.join(dir, d.name, `${d.name}.csproj`);
        if (existsSync(proj)) found.push({ name: d.name, proj });
      }
  };
  add(path.join(root, 'tools', 'tests'));
  for (const s of readdirSync(path.join(root, 'services'), { withFileTypes: true }))
    if (s.isDirectory()) add(path.join(root, 'services', s.name, 'tests'));
  return found;
}

function readTrx(file) {
  const text = readFileSync(file, 'utf8');
  const m = text.match(/<Counters\b[^>]*>/);
  if (!m) return null;
  const n = (k) => Number((m[0].match(new RegExp(`\\b${k}="(\\d+)"`)) ?? [])[1] ?? 0);
  return {
    total: n('total'),
    passed: n('passed'),
    failed: n('failed') + n('error') + n('timeout') + n('aborted'),
    skipped: n('notExecuted'),
  };
}

/** line coverage per package (assembly) from a Cobertura file, as Map<package, Map<"file|line", covered>> merged into `into`. */
function mergeCobertura(file, into) {
  const xml = readFileSync(file, 'utf8');
  for (const pkg of xml.matchAll(/<package\b[^>]*\bname="([^"]*)"[^>]*>([\s\S]*?)<\/package>/g)) {
    const [, name, body] = pkg;
    if (/Tests?$/.test(name)) continue; // the test assemblies themselves are not product code
    const lines = into.get(name) ?? new Map();
    for (const cls of body.matchAll(/<class\b[^>]*\bfilename="([^"]*)"[^>]*>([\s\S]*?)<\/class>/g)) {
      const [, filename, cbody] = cls;
      for (const l of cbody.matchAll(/<line\b[^>]*\bnumber="(\d+)"[^>]*\bhits="(\d+)"/g)) {
        const key = `${filename}|${l[1]}`;
        lines.set(key, (lines.get(key) ?? false) || Number(l[2]) > 0);
      }
    }
    into.set(name, lines);
  }
}

function runDotnet() {
  const rows = [];
  const merged = new Map();
  for (const p of dotnetProjects().filter((p) => wanted(p.name))) {
    const out = path.join(work, 'dotnet', p.name);
    rmSync(out, { recursive: true, force: true });
    log(`dotnet test ${p.name}`);
    const r = spawnSync(
      'dotnet',
      [
        'test',
        p.proj,
        '--collect:XPlat Code Coverage',
        '--results-directory',
        out,
        '--logger',
        'trx;LogFileName=result.trx',
        '--nologo',
        '-v',
        'q',
      ],
      { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: process.env },
    );
    const trx = path.join(out, 'result.trx');
    const counts = existsSync(trx) ? readTrx(trx) : null;
    const cov = [];
    const walk = (d) => {
      if (!existsSync(d)) return;
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) walk(f);
        else if (e.name === 'coverage.cobertura.xml') cov.push(f);
      }
    };
    walk(out);
    for (const f of cov) mergeCobertura(f, merged);
    rows.push({ name: p.name, kind: '.NET', counts, exit: r.status, covered: cov.length > 0 });
    if (!counts)
      log(
        `  no result file (exit ${r.status}); the tail of the output:\n${(r.stdout + r.stderr).split('\n').slice(-8).join('\n')}`,
      );
  }
  const coverage = [...merged.entries()]
    .map(([name, lines]) => ({ name, valid: lines.size, hit: [...lines.values()].filter(Boolean).length }))
    .filter((c) => c.valid > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { rows, coverage };
}

// ---- JavaScript (node --test) ------------------------------------------------------------------------------------------------------------------------------
const JS = [
  { name: 'graphql-bff', dir: 'services/graphql-bff', glob: 'test/**/*.test.ts', pre: [] },
  { name: 'customer-core', dir: 'packages/customer-core', glob: 'tests/**/*.test.ts', pre: [] },
  { name: 'web-session', dir: 'packages/web-session', glob: 'tests/**/*.test.ts', pre: [] },
  {
    name: 'mobile-customer',
    dir: 'apps/mobile-customer',
    glob: 'tests/**/*.test.ts',
    pre: [
      '--experimental-transform-types',
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      '--import',
      './tests/register.mjs',
    ],
  },
  { name: 'web-queue-display (unit)', dir: 'apps/web-queue-display', glob: 'tests/unit/**/*.test.ts', pre: [] },
];

function parseLcov(text, dir) {
  let file = null;
  const files = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('SF:')) file = { file: line.slice(3), found: 0, hit: 0 };
    else if (line.startsWith('LF:') && file) file.found = Number(line.slice(3));
    else if (line.startsWith('LH:') && file) file.hit = Number(line.slice(3));
    else if (line === 'end_of_record' && file) (files.push(file), (file = null));
  }
  return files
    .filter(
      (f) => !/[\\/](tests?|node_modules)[\\/]/.test(f.file) && !/\.test\.|\.config\./.test(f.file) && f.found > 0,
    )
    .map((f) => ({ ...f, dir }));
}

function runJs() {
  const rows = [];
  const coverage = [];
  for (const s of JS.filter((s) => wanted(s.name))) {
    const cwd = path.join(root, s.dir);
    if (!existsSync(path.join(cwd, 'node_modules')) && s.dir !== 'packages/customer-core')
      log(`  ${s.name}: node_modules missing (npm ci)`);
    const lcov = path.join(work, 'js', `${s.name.replace(/\W+/g, '-')}.lcov`);
    mkdirSync(path.dirname(lcov), { recursive: true });
    log(`node --test ${s.name}`);
    const r = spawnSync(
      process.execPath,
      [
        ...s.pre,
        '--test',
        '--experimental-test-coverage',
        '--test-coverage-exclude=**/test/**',
        '--test-coverage-exclude=**/tests/**',
        '--test-reporter=spec',
        '--test-reporter-destination=stdout',
        '--test-reporter=lcov',
        `--test-reporter-destination=${lcov}`,
        s.glob,
      ],
      { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, CI: '1' } },
    );
    const text = (r.stdout ?? '') + (r.stderr ?? '');
    const n = (k) => Number((text.match(new RegExp(`^ℹ ${k} (\\d+)`, 'm')) ?? [])[1] ?? 0);
    const counts = { total: n('tests'), passed: n('pass'), failed: n('fail'), skipped: n('skipped') + n('todo') };
    rows.push({
      name: s.name,
      kind: 'node --test',
      counts: counts.total ? counts : null,
      exit: r.status,
      covered: existsSync(lcov),
    });
    if (existsSync(lcov)) {
      const files = parseLcov(readFileSync(lcov, 'utf8'), s.dir);
      coverage.push({
        name: s.name,
        valid: files.reduce((a, f) => a + f.found, 0),
        hit: files.reduce((a, f) => a + f.hit, 0),
      });
    }
  }
  return { rows, coverage };
}

// ---- Playwright and Maestro: counted, not run ----------------------------------------------------------------------------------------------------------------
function listed() {
  const rows = [];
  for (const [name, dir, config] of [
    ['web-customer browser (mock-backed)', 'apps/web-customer', 'playwright.config.ts'],
    ['web-customer real-stack journeys', 'apps/web-customer', 'playwright.skeleton.config.ts'],
    ['web-queue-display browser (mock-backed)', 'apps/web-queue-display', 'playwright.config.ts'],
  ].filter(([n]) => wanted(n))) {
    const cli = path.join(root, dir, 'node_modules', '@playwright', 'test', 'cli.js');
    if (!existsSync(cli)) {
      rows.push({ name, kind: 'Playwright (listed)', counts: null });
      continue;
    }
    const r = spawnSync(process.execPath, [cli, 'test', '--list', '-c', config], {
      cwd: path.join(root, dir),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const m = (r.stdout ?? '').match(/Total: (\d+) tests? in (\d+) files?/);
    rows.push({ name, kind: 'Playwright (listed)', counts: m ? { total: Number(m[1]) } : null });
  }
  if (wanted('maestro')) {
    const dir = path.join(root, 'apps', 'mobile-customer', '.maestro');
    const flows = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+-.*\.yaml$/.test(f)).length : 0;
    rows.push({ name: 'mobile-customer Maestro flows', kind: 'Maestro (counted)', counts: { total: flows } });
  }
  return rows;
}

// ---- report -----------------------------------------------------------------------------------------------------------------------------------------------
const pct = (hit, valid) => (valid ? `${((100 * hit) / valid).toFixed(1)}%` : 'n/a');
const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' }).stdout.trim();

const dn = flag('--skip-dotnet') ? { rows: [], coverage: [] } : runDotnet();
const js = flag('--skip-js') ? { rows: [], coverage: [] } : runJs();
const lst = listed();

const mode = [
  process.env.REDIS_CONNECTION_STRING
    ? `Redis (${process.env.REDIS_CONNECTION_STRING})`
    : 'no Redis (the Redis tests skip or use fakes)',
  process.env.COSMOS_CONNECTION_STRING ? 'Cosmos emulator' : 'no Cosmos emulator (the Cosmos tests skip)',
].join('; ');
const today = new Date().toISOString().slice(0, 10);
const commit = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain') ? ' (working tree had uncommitted changes)' : '';

const lines = [];
const row = (r) => {
  const c = r.counts;
  const status = r.exit === 0 || r.exit === undefined ? '' : ` (exit ${r.exit})`;
  return c && c.passed !== undefined
    ? `| ${r.name} | ${r.kind} | ${c.total} | ${c.passed} | ${c.failed} | ${c.skipped} |${status ? ' ' + status : ''}`
    : `| ${r.name} | ${r.kind} | ${c ? c.total : 'not available'} | | | |`;
};
lines.push('| Suite | Kind | Tests | Passed | Failed | Skipped |', '|---|---|---:|---:|---:|---:|');
for (const r of [...dn.rows, ...js.rows, ...lst]) lines.push(row(r));
const sum = (rs, k) => rs.filter((r) => r.counts && r.counts.passed !== undefined).reduce((a, r) => a + r.counts[k], 0);
const ran = [...dn.rows, ...js.rows];
lines.push(
  `| **Run in this report** | | **${sum(ran, 'total')}** | **${sum(ran, 'passed')}** | **${sum(ran, 'failed')}** | **${sum(ran, 'skipped')}** |`,
);

const cov = [];
cov.push('| Product code | Lines | Covered | Line coverage |', '|---|---:|---:|---:|');
for (const c of dn.coverage) cov.push(`| ${c.name} (.NET) | ${c.valid} | ${c.hit} | ${pct(c.hit, c.valid)} |`);
for (const c of js.coverage) cov.push(`| ${c.name} (TypeScript) | ${c.valid} | ${c.hit} | ${pct(c.hit, c.valid)} |`);
const totV = [...dn.coverage, ...js.coverage].reduce((a, c) => a + c.valid, 0);
const totH = [...dn.coverage, ...js.coverage].reduce((a, c) => a + c.hit, 0);
cov.push(`| **All of the above** | **${totV}** | **${totH}** | **${pct(totH, totV)}** |`);

const body = [
  `Commit \`${commit}\`${dirty}, ${today}, ${os.type()} ${os.release()}, Node ${process.version}. Mode: ${mode}.`,
  '',
  '## Tests',
  '',
  ...lines,
  '',
  'Passed, failed and skipped come from the runs (TRX files for .NET, the `node --test` summary for JavaScript). Playwright suites are listed with `--list`, and Maestro flows are counted; neither was run here: their run results are in the evidence records (`docs/evidence/`).',
  '',
  '## Line coverage of the product code',
  '',
  ...cov,
  '',
  "What the figures cover: line coverage only (not branch coverage), from the unit and service tests above. The .NET reports of every test project are merged by file and line, and test projects are excluded. TypeScript is measured by Node's built-in coverage over the files the tests load, so a source file that no unit test imports is not in the figure. Not in it: the code the browser suites and the Maestro flows exercise (the web apps' screens and the Android screens), which is verified by those suites, not by this measurement.",
].join('\n');

console.log('\n' + body + '\n');
mkdirSync(work, { recursive: true });
writeFileSync(path.join(work, 'summary.md'), body);
if (flag('--write')) {
  const file = path.join(root, 'docs', 'evidence', `test-and-coverage-${today}.md`);
  writeFileSync(
    file,
    `# Test counts and line coverage, ${today}\n\n> **Status:** Snapshot · ${today} · generated by \`node scripts/ci/test-report.mjs --write\`; do not edit by hand, run it again for a newer record. A newer record replaces the numbers in the documents that link here.\n\n${body}\n`,
  );
  log(`wrote ${path.relative(root, file)}`);
}
const failed = [...dn.rows, ...js.rows].some((r) => (r.counts?.failed ?? 0) > 0 || (r.exit && !r.counts));
process.exit(failed ? 1 : 0);
