#!/usr/bin/env node
// Aggregates test runs into a quality report: pass rate, flake evidence and execution time per suite, and a run-by-run table with a
// small bar for the duration, so a change over runs is visible without a charting tool.
// Input: the JSON files that `node scripts/ci/summarize-results.mjs --json <file>` writes (one per run), or folders of them.
//
//   node scripts/ci/quality-report.mjs <file-or-folder>... [--title "text"] [--out report.md]
//
// Reading the numbers: "failure rate bound" is the 95% upper bound on the per-execution failure rate (Wilson score). With zero failures
// in n executions it is a little above 3/n: 570 clean executions bound it near 0.7%, which says "not frequent", not "never". A test that
// failed and then passed on retry is counted as flaky. The report states the dates and runtime it describes; it does not claim more.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const title = flag('--title') ?? 'Quality report';
const out = flag('--out');

const files = args.flatMap((p) =>
  statSync(p).isDirectory()
    ? readdirSync(p)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => path.join(p, f))
    : [p],
);
if (!files.length) {
  console.error(
    'usage: node scripts/ci/quality-report.mjs <summary.json or folder>... [--title text] [--out report.md]',
  );
  process.exit(2);
}
const runs = files.map((f) => ({ file: f, ...JSON.parse(readFileSync(f, 'utf8')) }));

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** Wilson score upper bound for k failures in n trials, at 95%. */
const upper = (k, n) => {
  if (!n) return NaN;
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  return (p + (z * z) / (2 * n) + z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
};
const pct = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(x < 0.01 ? 2 : 1)}%` : 'n/a');
const bar = (v, max) => '█'.repeat(Math.max(1, Math.round((v / max) * 20)));

const suiteNames = [...new Set(runs.flatMap((r) => r.suites.map((s) => s.suite)))];
const lines = [`# ${title}`, ''];
const summary = [];
for (const name of suiteNames) {
  const rows = runs.map((r) => r.suites.find((s) => s.suite === name)).filter(Boolean);
  const n = rows.reduce((a, s) => a + s.total - s.skipped, 0);
  const failed = rows.reduce((a, s) => a + s.failed, 0);
  const flaky = rows.reduce((a, s) => a + (s.retries ?? 0), 0);
  const skipped = rows.reduce((a, s) => a + s.skipped, 0);
  const secs = rows.map((s) => s.seconds).filter((x) => Number.isFinite(x));
  summary.push(
    `| ${name} | ${rows.length} | ${n} | ${failed} | ${flaky} | ${skipped} | ${pct(n ? (n - failed) / n : NaN)} | ${pct(upper(failed, n))} | ${secs.length ? `${Math.min(...secs).toFixed(1)} / ${median(secs).toFixed(1)} / ${Math.max(...secs).toFixed(1)}` : 'n/a'} |`,
  );
}
lines.push(
  `${runs.length} run(s) from ${runs[0].recordedAt?.slice(0, 10) ?? 'an unknown date'} to ${runs.at(-1).recordedAt?.slice(0, 10) ?? 'an unknown date'}, Node ${runs[0].node ?? 'unknown'}. Passed, failed and skipped are separate; a skip is never a pass.`,
  '',
  '| Suite | Runs | Executions | Failed | Flaky retries | Skipped | Pass rate | Failure rate bound (95%) | Seconds min / median / max |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---|',
  ...summary,
  '',
);

for (const name of suiteNames) {
  const rows = runs.map((r) => ({ at: r.recordedAt, s: r.suites.find((s) => s.suite === name) })).filter((x) => x.s);
  const max = Math.max(...rows.map((x) => x.s.seconds ?? 0), 1);
  lines.push(
    `## ${name}, run by run`,
    '',
    '| Run | Recorded | Passed | Failed | Skipped | Flaky | Seconds | |',
    '|---:|---|---:|---:|---:|---:|---:|---|',
    ...rows.map(
      (x, i) =>
        `| ${i + 1} | ${x.at?.slice(0, 19).replace('T', ' ') ?? ''} | ${x.s.passed} | ${x.s.failed} | ${x.s.skipped} | ${x.s.retries ?? 0} | ${x.s.seconds ?? 'n/a'} | ${bar(x.s.seconds ?? 0, max)} |`,
    ),
    '',
  );
}
const text = lines.join('\n');
console.log(text);
if (out) {
  mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  writeFileSync(out, text);
}
