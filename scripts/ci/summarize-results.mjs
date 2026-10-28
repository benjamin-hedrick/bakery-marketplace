// Turns test result files into the evidence record defined in docs/process/quality-gates.md.
//
//   node scripts/ci/summarize-results.mjs [--json <out.json>] <result-file>...
//
// Understands dotnet `.trx` and JUnit XML (Playwright's `junit` reporter, Node's `--test-reporter=junit`).
// Prints a markdown table; passed, failed, skipped (and not-run) are separate columns, never merged.
// With --json, also writes one record per suite plus run metadata, for comparing runs (execution time, flakes).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const jsonIdx = args.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? args.splice(jsonIdx, 2)[1] : undefined;
const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

function fromTrx(xml, file) {
  const counters = /<Counters [^>]*>/.exec(xml)?.[0] ?? '';
  const times = /<Times [^>]*>/.exec(xml)?.[0] ?? '';
  const seconds = (Date.parse(attr(times, 'finish') ?? '') - Date.parse(attr(times, 'start') ?? '')) / 1000;
  const total = Number(attr(counters, 'total') ?? 0);
  const executed = Number(attr(counters, 'executed') ?? 0);
  return {
    suite:
      /codeBase="([^"]*\.dll)"/
        .exec(xml)?.[1]
        .split(/[\\/]/)
        .pop()
        .replace(/\.dll$/, '') ?? path.basename(file),
    kind: 'trx',
    total,
    passed: Number(attr(counters, 'passed') ?? 0),
    failed: Number(attr(counters, 'failed') ?? 0),
    skipped: Math.max(0, total - executed),
    notRun: Number(attr(counters, 'notExecuted') ?? 0),
    seconds: Number.isFinite(seconds) ? seconds : null,
    retries: 0,
  };
}

function fromJunit(xml, file) {
  // Attribute values may contain ">" (a suite named "A <-> B"), so skip over quoted strings instead of stopping at the first ">".
  const suites = [...xml.matchAll(/<testsuite\b(?:[^>"]|"[^"]*")*>/g)].map((m) => m[0]);
  const sum = (name) => suites.reduce((n, s) => n + Number(attr(s, name) ?? 0), 0);
  const total = sum('tests'),
    failed = sum('failures') + sum('errors'),
    skipped = sum('skipped');
  // Playwright marks a test that failed then passed on retry as a flaky pass; keep that visible.
  const flaky = (xml.match(/<flakyTest\b/g) ?? []).length;
  return {
    suite: path.basename(file).replace(/\.xml$/, ''),
    kind: 'junit',
    total,
    passed: total - failed - skipped,
    failed,
    skipped,
    notRun: 0,
    seconds: Math.round(sum('time') * 1000) / 1000,
    retries: flaky,
  };
}

// A missing file means the step that writes it did not run or died first. Say so and fail, instead of a stack trace.
const missing = args.filter((file) => !existsSync(file));
for (const file of missing) {
  console.error(
    `MISSING result file: ${file} (the test step did not run, or failed before writing it; see that step's log)`,
  );
}
const rows = args
  .filter((file) => !missing.includes(file))
  .map((file) => {
    const xml = readFileSync(file, 'utf8');
    return file.endsWith('.trx') ? fromTrx(xml, file) : fromJunit(xml, file);
  });

console.log('| Suite | Total | Passed | Failed | Skipped | Not run | Seconds | Flaky retries |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
for (const r of rows)
  console.log(
    `| ${r.suite} | ${r.total} | ${r.passed} | ${r.failed} | ${r.skipped} | ${r.notRun} | ${r.seconds ?? 'n/a'} | ${r.retries} |`,
  );

if (jsonOut) {
  const record = {
    recordedAt: new Date().toISOString(),
    commit: process.env.BUILD_SOURCEVERSION ?? process.env.GIT_COMMIT ?? null,
    build: process.env.BUILD_BUILDNUMBER ?? null,
    node: process.version,
    suites: rows,
  };
  mkdirSync(path.dirname(jsonOut), { recursive: true });
  writeFileSync(jsonOut, JSON.stringify(record, null, 2));
  console.log(`\nWrote ${jsonOut}`);
}
process.exitCode = rows.some((r) => r.failed > 0) || missing.length > 0 ? 1 : 0;
