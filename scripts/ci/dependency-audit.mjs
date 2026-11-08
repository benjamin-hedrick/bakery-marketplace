#!/usr/bin/env node
// Dependency audit and software bill of materials (WI-SEC-004, gap rows T-36 and G-E09).
//
//   node scripts/ci/dependency-audit.mjs [--no-sbom] [--out artifacts/dependency-audit]
//
// What it does:
//   1. `npm audit` of every npm project (apps, services/graphql-bff, packages), once for all dependencies and once for the production
//      ones only (`--omit=dev`): what ships is judged on the second, what only builds or tests the code on the first.
//   2. `dotnet list package --vulnerable --include-transitive` and `--deprecated` over the root solution (NuGet advisories).
//   3. A CycloneDX 1.6 SBOM (JSON) for each npm app or service (production dependencies) and for each of the four .NET services,
//      written to <out>/sbom/. The .NET tool is installed into <out>/tools at a pinned version.
//   4. A summary, <out>/summary.md, and the raw audit output in <out>/raw/.
//
// Policy (proposed, the lead decides; docs/evidence/WI-SEC-004/): exit 1 when a PRODUCTION dependency has a high or critical advisory, or a
// NuGet package has any known vulnerability; moderate and low advisories in development tooling are reported, not failed. Exit 2 when an
// audit could not run (no network, no registry answer): an audit that did not run is not a pass.
// Needs network access to the npm registry and nuget.org, `npm ci` already run in each project, and the .NET SDK.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const sbom = !args.includes('--no-sbom');
const outIdx = args.indexOf('--out');
const out = path.resolve(root, outIdx >= 0 ? args[outIdx + 1] : 'artifacts/dependency-audit');
// Pinned so a new release of either generator cannot change the output unnoticed. Update deliberately.
const CYCLONEDX_NPM = '@cyclonedx/cyclonedx-npm@6.0.1';
const CYCLONEDX_DOTNET = '6.3.1';

const NPM_PROJECTS = [
  { name: 'web-customer', dir: 'apps/web-customer', sbom: true },
  { name: 'web-queue-display', dir: 'apps/web-queue-display', sbom: true },
  { name: 'mobile-customer', dir: 'apps/mobile-customer', sbom: true },
  { name: 'graphql-bff', dir: 'services/graphql-bff', sbom: true },
  { name: 'customer-core', dir: 'packages/customer-core', sbom: false }, // a library: its dependencies appear in the apps that use it
  { name: 'web-session', dir: 'packages/web-session', sbom: false },
];
const DOTNET_SERVICES = [
  { name: 'catalog-service', project: 'services/catalog-service/src/CatalogService.csproj' },
  { name: 'ordering-service', project: 'services/ordering-service/src/OrderingService.csproj' },
  { name: 'notification-service', project: 'services/notification-service/src/NotificationService.csproj' },
  { name: 'admin-service', project: 'services/admin-service/src/AdminService.csproj' },
];

const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const npx = isWin ? 'npx.cmd' : 'npx';
const run = (cmd, a, cwd) =>
  spawnSync(cmd, a, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, shell: isWin && cmd.endsWith('.cmd') });

fs.mkdirSync(path.join(out, 'raw'), { recursive: true });
fs.mkdirSync(path.join(out, 'sbom'), { recursive: true });

let couldNotRun = false;
let failed = false;
const rows = [];
const findings = [];

// ---- npm ---------------------------------------------------------------------------------------------------------
function audit(project, production) {
  const r = run(npm, ['audit', '--json', ...(production ? ['--omit=dev'] : [])], path.join(root, project.dir));
  let report;
  try {
    report = JSON.parse(r.stdout);
  } catch {
    report = null;
  }
  fs.writeFileSync(
    path.join(out, 'raw', `npm-${project.name}${production ? '-prod' : ''}.json`),
    r.stdout || r.stderr || '',
  );
  // npm reports a registry failure as an error object; a clean audit has metadata.vulnerabilities.
  if (!report || report.error || !report.metadata?.vulnerabilities) {
    couldNotRun = true;
    console.error(
      `npm audit could not run in ${project.dir}${production ? ' (production)' : ''}: ${report?.error?.summary ?? r.stderr?.slice(0, 200)}`,
    );
    return null;
  }
  return report;
}

for (const p of NPM_PROJECTS) {
  if (!fs.existsSync(path.join(root, p.dir, 'node_modules'))) {
    couldNotRun = true;
    console.error(`${p.dir}: node_modules missing; run npm ci there first`);
    continue;
  }
  const all = audit(p, false);
  const prod = audit(p, true);
  if (!all || !prod) continue;
  const a = all.metadata.vulnerabilities;
  const b = prod.metadata.vulnerabilities;
  rows.push({ kind: 'npm', name: p.name, all: a, prod: b });
  if (b.high + b.critical > 0) failed = true;
  for (const [pkg, v] of Object.entries(all.vulnerabilities ?? {})) {
    const advisories = v.via.filter((x) => typeof x === 'object');
    findings.push({
      project: p.name,
      pkg,
      severity: v.severity,
      production: Boolean(prod.vulnerabilities?.[pkg]),
      direct: v.isDirect,
      title: advisories.map((x) => x.title).join('; ') || `via ${v.via.join(', ')}`,
      url: advisories.map((x) => x.url).filter(Boolean)[0] ?? '',
      fix:
        v.fixAvailable === true
          ? 'yes'
          : v.fixAvailable
            ? `breaking: ${v.fixAvailable.name}@${v.fixAvailable.version}`
            : 'none',
    });
  }
}

// ---- NuGet -------------------------------------------------------------------------------------------------------
const nuget = { vulnerable: [], deprecated: [] };
for (const kind of ['vulnerable', 'deprecated']) {
  const r = run(
    'dotnet',
    [
      'list',
      'BakeryMarketplace.slnx',
      'package',
      `--${kind}`,
      ...(kind === 'vulnerable' ? ['--include-transitive'] : []),
      '--format',
      'json',
      '--output-version',
      '1',
    ],
    root,
  );
  fs.writeFileSync(path.join(out, 'raw', `nuget-${kind}.json`), r.stdout || r.stderr || '');
  let report;
  try {
    report = JSON.parse(r.stdout);
  } catch {
    report = null;
  }
  if (!report || r.status !== 0 || (report.problems ?? []).some((x) => x.level === 'error')) {
    couldNotRun = true;
    console.error(
      `dotnet list package --${kind} could not run: ${(report?.problems ?? []).map((x) => x.text).join('; ') || r.stderr?.slice(0, 200)}`,
    );
    continue;
  }
  for (const proj of report.projects ?? []) {
    for (const fw of proj.frameworks ?? []) {
      for (const pkg of [...(fw.topLevelPackages ?? []), ...(fw.transitivePackages ?? [])]) {
        nuget[kind].push({
          project: path.basename(proj.path, '.csproj'),
          id: pkg.id,
          version: pkg.resolvedVersion,
          detail:
            kind === 'vulnerable'
              ? (pkg.vulnerabilities ?? []).map((v) => `${v.severity} ${v.advisoryurl}`).join('; ')
              : `${(pkg.deprecationReasons ?? []).join(', ')}${pkg.alternativePackage ? ` -> ${pkg.alternativePackage.id}` : ''}`,
        });
      }
    }
  }
}
if (nuget.vulnerable.length > 0) failed = true;

// ---- SBOMs -------------------------------------------------------------------------------------------------------
const sboms = [];
if (sbom) {
  for (const p of NPM_PROJECTS.filter((x) => x.sbom)) {
    const file = path.join(out, 'sbom', `${p.name}.cdx.json`);
    const r = run(
      npx,
      [
        '--yes',
        CYCLONEDX_NPM,
        '--omit',
        'dev',
        '--output-format',
        'JSON',
        '--spec-version',
        '1.6',
        '--output-file',
        file,
      ],
      path.join(root, p.dir),
    );
    if (r.status !== 0 || !fs.existsSync(file)) {
      couldNotRun = true;
      console.error(`SBOM for ${p.name} could not be made: ${r.stderr?.slice(0, 200)}`);
      continue;
    }
    sboms.push({
      name: p.name,
      file: path.relative(root, file),
      components: JSON.parse(fs.readFileSync(file, 'utf8')).components?.length ?? 0,
    });
  }

  const toolDir = path.join(out, 'tools');
  const tool = path.join(toolDir, isWin ? 'dotnet-cyclonedx.exe' : 'dotnet-cyclonedx');
  if (!fs.existsSync(tool))
    run('dotnet', ['tool', 'install', '--tool-path', toolDir, 'CycloneDX', '--version', CYCLONEDX_DOTNET], root);
  for (const s of DOTNET_SERVICES) {
    const file = path.join(out, 'sbom', `${s.name}.cdx.json`);
    const r = run(
      tool,
      [
        path.join(root, s.project),
        '--output-format',
        'Json',
        '--spec-version',
        '1.6',
        '--output',
        path.join(out, 'sbom'),
        '--filename',
        `${s.name}.cdx.json`,
        '--exclude-test-projects',
      ],
      root,
    );
    if (r.status !== 0 || !fs.existsSync(file)) {
      couldNotRun = true;
      console.error(`SBOM for ${s.name} could not be made: ${(r.stderr || r.stdout)?.slice(0, 200)}`);
      continue;
    }
    sboms.push({
      name: s.name,
      file: path.relative(root, file),
      components: JSON.parse(fs.readFileSync(file, 'utf8')).components?.length ?? 0,
    });
  }
}

// ---- summary -----------------------------------------------------------------------------------------------------
const sev = (v) => `${v.critical} / ${v.high} / ${v.moderate} / ${v.low}`;
const lines = [
  '# Dependency audit and SBOM',
  '',
  `Run: ${new Date().toISOString()} · commit ${run('git', ['rev-parse', '--short', 'HEAD'], root).stdout.trim()} · node ${process.version}`,
  `Command: \`node scripts/ci/dependency-audit.mjs\` (raw output in \`raw/\`)`,
  '',
  '## npm (critical / high / moderate / low)',
  '',
  '| Project | All dependencies | Production only |',
  '|---|---|---|',
  ...rows.filter((r) => r.kind === 'npm').map((r) => `| ${r.name} | ${sev(r.all)} | ${sev(r.prod)} |`),
  '',
  ...(findings.length
    ? [
        '### Findings',
        '',
        '| Project | Package | Severity | Ships | Fix | What |',
        '|---|---|---|---|---|---|',
        ...findings.map(
          (f) =>
            `| ${f.project} | ${f.pkg}${f.direct ? ' (direct)' : ''} | ${f.severity} | ${f.production ? 'yes' : 'no (dev tooling)'} | ${f.fix} | ${f.title}${f.url ? ` ${f.url}` : ''} |`,
        ),
        '',
      ]
    : ['No npm advisories.', '']),
  '## NuGet',
  '',
  nuget.vulnerable.length
    ? ['Vulnerable packages:', ...nuget.vulnerable.map((v) => `- ${v.project}: ${v.id} ${v.version} ${v.detail}`)].join(
        '\n',
      )
    : 'No vulnerable packages (direct and transitive) in the root solution.',
  '',
  nuget.deprecated.length
    ? [
        'Deprecated packages:',
        ...nuget.deprecated.map((v) => `- ${v.project}: ${v.id} ${v.version} (${v.detail})`),
      ].join('\n')
    : 'No deprecated packages.',
  '',
  '## SBOMs (CycloneDX 1.6, JSON; production dependencies; test projects excluded)',
  '',
  sbom
    ? ['| SBOM | Components |', '|---|---|', ...sboms.map((s) => `| \`${s.file}\` | ${s.components} |`)].join('\n')
    : 'Skipped (--no-sbom).',
  '',
  `Result: ${couldNotRun ? 'AN AUDIT OR SBOM STEP DID NOT RUN (exit 2)' : failed ? 'FAIL: a production npm dependency has a high or critical advisory, or a NuGet package is vulnerable (exit 1)' : 'pass under the proposed policy (no high or critical advisory in production npm dependencies, no vulnerable NuGet package)'}`,
  '',
];
fs.writeFileSync(path.join(out, 'summary.md'), lines.join('\n'));
console.log(lines.join('\n'));
console.log(`\nSummary and raw output: ${path.relative(root, out)}`);
process.exit(couldNotRun ? 2 : failed ? 1 : 0);
