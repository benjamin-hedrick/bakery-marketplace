#!/usr/bin/env node
// A static analysis of the committed tree with SonarQube Community Build, run locally in Docker (the same pattern as zap-scan.mjs and
// linux-check.mjs). It starts a SonarQube server container, builds the analysis image (scripts/ci/sonar/Dockerfile), analyses C# and
// TypeScript in one run, waits for the quality gate and prints the result. No account, no token to keep, nothing leaves this machine.
//
//   node scripts/ci/sonar-scan.mjs [--keep] [--port 9000] [--image sonarqube:community]
//
// --keep leaves the server running afterwards so the findings can be browsed at http://localhost:<port> (admin / the password printed).
// Needs Docker (the server image and the analysis image are large the first time; allow several minutes). Uncommitted changes are NOT
// scanned: the scan reads a clean checkout of HEAD. The analysis does not run the tests, so it reports no coverage.
// Reports go to artifacts/sonar/. Exit code 0 when the scan ran and the quality gate passed; 3 when it ran and the gate failed (findings
// are for reading, like the ZAP scan); 1 when the scan could not run.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const keep = argv.includes('--keep');
const port = opt('--port', '9000');
const serverImage = opt('--image', 'sonarqube:community');
const analysisImage = 'bakery-sonar-scan';
const network = 'bakery-sonar';
const server = 'bakery-sonar-server';
const projectKey = 'bakery-marketplace';
const password = 'Bakery-local-1-' + Math.random().toString(36).slice(2, 10); // throwaway: the server is destroyed unless --keep
const work = path.join(os.tmpdir(), 'bakery-sonar-scan');
const out = path.join(root, 'artifacts', 'sonar');
mkdirSync(out, { recursive: true });

const log = (m) => console.log(`[sonar] ${m}`);
const run = (cmd, args, o = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...o });
const docker = (...args) => run('docker', args);
const git = (...args) => run('git', args, { cwd: root });

function cleanup() {
  if (!keep) {
    docker('rm', '-f', server);
    docker('network', 'rm', network);
  }
  git('worktree', 'remove', '--force', work);
}

async function api(pathname, { method = 'GET', body, auth = password } = {}) {
  const res = await fetch(`http://localhost:${port}${pathname}`, {
    method,
    headers: {
      Authorization: 'Basic ' + Buffer.from(`admin:${auth}`).toString('base64'),
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body,
  });
  const text = await res.text();
  return { status: res.status, json: text.startsWith('{') ? JSON.parse(text) : text };
}

let exitCode = 1;
try {
  if (docker('version').status !== 0) throw new Error('Docker is not running.');
  cleanup();
  rmSync(work, { recursive: true, force: true });
  git('worktree', 'prune');
  const add = git('-c', 'core.autocrlf=false', 'worktree', 'add', '--detach', '--force', work, 'HEAD');
  if (add.status !== 0) throw new Error('Could not check out the committed tree: ' + add.stderr);

  log('building the analysis image');
  const build = run('docker', ['build', '-t', analysisImage, path.join(root, 'scripts', 'ci', 'sonar')], {
    stdio: 'inherit',
  });
  if (build.status !== 0) throw new Error('The analysis image did not build.');

  docker('network', 'create', network);
  log(`starting ${serverImage} on http://localhost:${port}`);
  const start = docker('run', '-d', '--name', server, '--network', network, '-p', `${port}:9000`, serverImage);
  if (start.status !== 0) throw new Error('The server did not start: ' + start.stderr);

  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    try {
      const r = await fetch(`http://localhost:${port}/api/system/status`);
      up = r.ok && (await r.json()).status === 'UP';
    } catch {
      /* not listening yet */
    }
    if (!up) await new Promise((r) => setTimeout(r, 3000));
  }
  if (!up) throw new Error('The server was not UP after 6 minutes (docker logs ' + server + ').');

  // A fresh server has admin / admin; replace it with the throwaway password, then ask for an analysis token.
  const changed = await api('/api/users/change_password', {
    method: 'POST',
    auth: 'admin',
    body: new URLSearchParams({ login: 'admin', previousPassword: 'admin', password }).toString(),
  });
  if (changed.status >= 300) throw new Error('Could not set the admin password: ' + JSON.stringify(changed.json));
  const tok = await api('/api/user_tokens/generate', {
    method: 'POST',
    body: new URLSearchParams({ name: 'scan' }).toString(),
  });
  const token = tok.json.token;
  if (!token) throw new Error('No analysis token: ' + JSON.stringify(tok.json));

  const exclusions =
    '**/node_modules/**,**/__generated__/**,**/.next*/**,**/bin/**,**/obj/**,**/dist/**,**/*.generated.*,**/artifacts/**';
  const tests = '**/tests/**,**/*.test.*,**/e2e/**,**/.maestro/**';
  const url = `http://${server}:9000`;
  const script = [
    `dotnet sonarscanner begin /k:${projectKey} /n:"Bakery Marketplace" /d:sonar.host.url=${url} /d:sonar.token=${token}` +
      ` /d:sonar.scm.disabled=true /d:sonar.exclusions="${exclusions}" /d:sonar.test.inclusions="${tests}"` +
      ' /d:sonar.qualitygate.wait=true /d:sonar.qualitygate.timeout=300',
    'dotnet build BakeryMarketplace.slnx --no-incremental -v q',
    `dotnet sonarscanner end /d:sonar.token=${token}`,
  ].join(' && ');
  log('analysing (build + C# + TypeScript); this takes several minutes');
  const scan = run(
    'docker',
    ['run', '--rm', '--network', network, '-v', `${work}:/src`, '-w', '/src', analysisImage, 'bash', '-c', script],
    { stdio: 'inherit' },
  );
  // A failed quality gate also makes the scanner exit non-zero, so the server's own report below decides whether the analysis completed.
  log(`the analysis container exited with ${scan.status}`);

  const gate = await api(`/api/qualitygates/project_status?projectKey=${projectKey}`);
  if (!gate.json.projectStatus || gate.json.projectStatus.status === 'NONE') {
    throw new Error('No analysis result on the server (the analysis did not complete).');
  }
  const metricKeys =
    'bugs,vulnerabilities,security_hotspots,code_smells,duplicated_lines_density,ncloc,reliability_rating,security_rating,sqale_rating';
  const measures = await api(`/api/measures/component?component=${projectKey}&metricKeys=${metricKeys}`);
  const issues = await api(
    `/api/issues/search?componentKeys=${projectKey}&resolved=false&ps=1&facets=severities,languages,types`,
  );
  writeFileSync(
    path.join(out, 'sonar-summary.json'),
    JSON.stringify({ gate: gate.json, measures: measures.json, issues: issues.json.facets }, null, 2),
  );

  log(`quality gate: ${gate.json.projectStatus.status}`);
  for (const m of measures.json.component?.measures ?? []) log(`  ${m.metric}: ${m.value}`);
  for (const f of issues.json.facets ?? [])
    log(`  open issues by ${f.property}: ${f.values.map((v) => `${v.val}=${v.count}`).join(', ')}`);
  log('summary written to artifacts/sonar/sonar-summary.json');
  if (keep) log(`server kept: http://localhost:${port}  (admin / ${password})`);
  exitCode = gate.json.projectStatus.status === 'OK' ? 0 : 3;
} catch (e) {
  console.error(`[sonar] ${e.message}`);
} finally {
  cleanup();
}
process.exit(exitCode);
