#!/usr/bin/env node
// A container image scan with Trivy, run in Docker like the secret scan (WI-SEC-007, register 162 point 4). It scans:
//   - the six images the dev stack deploys (scripts/ci/dev-images.mjs IMAGES: five apps and the seed job), built here one at a time, with no
//     credentials and no registry, the way the pipeline builds them;
//   - every image the Compose file pulls from elsewhere (Redis, the Cosmos emulator, the Aspire dashboard, the OpenTelemetry collector, Jaeger).
//
//   node scripts/ci/image-scan.mjs [--out <dir>] [--only <text>] [--no-build]
//
//   --out <dir>   where the summary and the tool's raw JSON go (default docs/evidence/WI-SEC-007/<today>)
//   --only <text> scan only the images whose reference contains <text> (for a quick try)
//   --no-build    use the images already built as bakery-*:scan instead of building them again
//
// Needs Docker and the network (the first run pulls Trivy and its vulnerability database, kept in the Docker volume bakery-trivy-cache).
// Nothing here reads or prints a secret; the scan reads the images' packages, not their environment.
// Exit code: 0 = nothing to fail on, 1 = a high or critical finding that has a fix, 2 = a scan could not run and nothing failed (an image
// that could not be built, pulled or scanned is not a pass), 3 = bad usage. When there are findings and a scan also failed, the code is 1 and the
// summary lists both. Unfixed findings and findings below high are reported, not failed.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArgs, IMAGES } from './dev-images.mjs';

// Pinned by digest (Trivy 0.76.2) so a new release cannot change the result unnoticed. Update deliberately.
export const TRIVY_IMAGE = 'aquasec/trivy@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb';
const CACHE_VOLUME = 'bakery-trivy-cache';
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];

/**
 * Counts per severity, and the high or critical findings that have a fixed version, from one Trivy JSON report.
 * @param {any} report Trivy's `--format json` output for one image
 * @returns {{counts: Record<string, number>, fixableHigh: {id: string, pkg: string, installed: string, fixed: string, severity: string, target: string}[]}}
 */
export function summarize(report) {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  const fixableHigh = [];
  for (const result of report?.Results ?? []) {
    for (const v of result.Vulnerabilities ?? []) {
      const severity = SEVERITIES.includes(v.Severity) ? v.Severity : 'UNKNOWN';
      counts[severity] += 1;
      if ((severity === 'HIGH' || severity === 'CRITICAL') && v.FixedVersion) {
        fixableHigh.push({
          id: v.VulnerabilityID,
          pkg: v.PkgName,
          installed: v.InstalledVersion,
          fixed: v.FixedVersion,
          severity,
          target: result.Target,
        });
      }
    }
  }
  return { counts, fixableHigh };
}

/**
 * The exit code for a set of scans. `results` has one entry per image: either `{ image, summary }` or `{ image, error }` for a scan that did not run.
 * 1 when any image has a high or critical finding with a fix; otherwise 2 when any scan did not run; otherwise 0.
 */
export function exitCodeFor(results) {
  if (results.some((r) => r.summary && r.summary.fixableHigh.length > 0)) return 1;
  if (results.some((r) => r.error)) return 2;
  return 0;
}

/** The images a Compose file pulls from a registry: services with an `image` and no `build`, each once, sorted. Input is `docker compose config --format json`. */
export function pulledImages(composeConfig) {
  const refs = new Set();
  for (const service of Object.values(composeConfig?.services ?? {})) {
    if (service.image && !service.build) refs.add(service.image);
  }
  return [...refs].sort();
}

/**
 * The arguments of a `docker build` with `--pull` added: the base images (`node:24-slim`, `dotnet/aspnet:10.0`) are floating tags, and a scan of a
 * stale local copy would report findings the current base no longer has (register 240 decision 1).
 */
export function withPull(args) {
  if (args[0] !== 'build') throw new Error(`not a docker build: ${args[0]}`);
  return ['build', '--pull', ...args.slice(1)];
}

/** The scan's built images: the deployed six, tagged `scan`, with their repository names as the reference. */
export function builtImages(tag = 'scan') {
  return IMAGES.map((image) => ({ image, reference: `${image.repository}:${tag}` }));
}

/** The summary as Markdown: one row per image, then each fixable high or critical finding, then what could not run. */
export function renderSummary(results, { when, trivy }) {
  const lines = [
    `# Image scan, ${when}`,
    '',
    `Trivy: \`${trivy}\`. High or critical findings that have a fix fail the scan; the rest are reported.`,
    '',
  ];
  lines.push(
    '| Image | Critical | High | Medium | Low | Unknown | Fixable high or critical |',
    '|---|---:|---:|---:|---:|---:|---:|',
  );
  for (const r of results) {
    if (r.error) lines.push(`| \`${r.reference}\` | not scanned: ${r.error} | | | | | |`);
    else {
      const c = r.summary.counts;
      lines.push(
        `| \`${r.reference}\` | ${c.CRITICAL} | ${c.HIGH} | ${c.MEDIUM} | ${c.LOW} | ${c.UNKNOWN} | ${r.summary.fixableHigh.length} |`,
      );
    }
  }
  const failing = results.filter((r) => r.summary?.fixableHigh.length);
  if (failing.length > 0) {
    lines.push('', '## High or critical findings with a fix', '');
    for (const r of failing) {
      lines.push(
        `### \`${r.reference}\``,
        '',
        '| Id | Package | Installed | Fixed in | Severity | Layer |',
        '|---|---|---|---|---|---|',
      );
      for (const f of r.summary.fixableHigh)
        lines.push(`| ${f.id} | ${f.pkg} | ${f.installed} | ${f.fixed} | ${f.severity} | ${f.target} |`);
      lines.push('');
    }
  }
  return lines.join('\n') + '\n';
}

// ---- the run ---------------------------------------------------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { out: null, only: null, build: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--only') opts.only = argv[++i];
    else if (a === '--no-build') opts.build = false;
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

const docker = (args, options = {}) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
    ...options,
  });

function scanOne(reference, scratch, rawDir) {
  const name = reference.replace(/[^A-Za-z0-9_.-]+/g, '_');
  const tar = path.join(scratch, `${name}.tar`);
  docker(['save', '--output', tar, reference]);
  const mount = scratch.replaceAll('\\', '/');
  docker([
    'run',
    '--rm',
    '-v',
    `${CACHE_VOLUME}:/root/.cache`,
    '-v',
    `${mount}:/scan`,
    TRIVY_IMAGE,
    'image',
    '--input',
    `/scan/${name}.tar`,
    '--scanners',
    'vuln',
    '--format',
    'json',
    '--output',
    `/scan/${name}.json`,
    '--timeout',
    '30m', // the default, 5 minutes, is too short for the Cosmos emulator's large image (the first run did not finish it)
    '--quiet',
  ]);
  const raw = readFileSync(path.join(scratch, `${name}.json`), 'utf8');
  writeFileSync(path.join(rawDir, `${name}.json`), raw);
  rmSync(tar, { force: true });
  return JSON.parse(raw);
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(String(e.message));
    process.exit(3);
  }
  const when = new Date().toISOString().slice(0, 10);
  const out = path.resolve(root, opts.out ?? path.join('docs', 'evidence', 'WI-SEC-007', when));
  const rawDir = path.join(out, 'raw');
  mkdirSync(rawDir, { recursive: true });
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'image-scan-'));

  let config;
  try {
    config = JSON.parse(
      docker(
        [
          'compose',
          '--profile',
          'apps',
          '--profile',
          'with-redis',
          '--profile',
          'tracing',
          '--profile',
          'collector',
          '--profile',
          'jaeger',
          'config',
          '--format',
          'json',
        ],
        { cwd: root },
      ),
    );
  } catch (e) {
    console.error('image scan could not read the Compose file (is Docker running?):', String(e.message).split('\n')[0]);
    process.exit(2);
  }

  const wanted = (reference) => !opts.only || reference.includes(opts.only);
  const plan = [
    ...builtImages()
      .filter((b) => wanted(b.reference))
      .map((b) => ({ ...b, built: true })),
    ...pulledImages(config)
      .filter(wanted)
      .map((reference) => ({ reference, built: false })),
  ];

  const results = [];
  try {
    for (const item of plan) {
      console.log(`scanning ${item.reference}`);
      try {
        if (item.built && opts.build)
          docker(withPull(buildArgs(item.image, 'scan', 'image-scan')), {
            cwd: root,
            stdio: ['ignore', 'pipe', 'inherit'],
          });
        else if (!item.built) docker(['pull', '--quiet', item.reference]);
        results.push({
          image: item.image,
          reference: item.reference,
          summary: summarize(scanOne(item.reference, scratch, rawDir)),
        });
      } catch (e) {
        const message = String(e.stderr ?? e.message)
          .trim()
          .split('\n')
          .slice(-1)[0]
          .replace(/[\s|]+/g, ' ') // one line, and no pipe to break the summary's table
          .slice(0, 200);
        console.error(`  not scanned: ${message}`);
        results.push({ reference: item.reference, error: message });
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const trivy = TRIVY_IMAGE.split('@')[0] + ' ' + TRIVY_IMAGE.split('@')[1].slice(0, 19);
  const summary = renderSummary(results, { when, trivy });
  writeFileSync(path.join(out, 'summary.md'), summary);
  console.log('\n' + summary);
  console.log(`written to ${path.relative(root, out)}`);
  process.exit(exitCodeFor(results));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
