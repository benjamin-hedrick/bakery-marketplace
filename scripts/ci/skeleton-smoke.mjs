// Walking-skeleton smoke (WI-PORT-002/003, S1-07a): brings up the real local stack, seeds it, runs Playwright, tears down.
// The stack: Redis, the Cosmos emulator and the mock OIDC issuer (Compose), the catalog and ordering services, the GraphQL BFF and Next.js.
// Ordering calls the catalog with its own client-credentials secret, which scripts/dev/init-env.mjs writes to the git-ignored .env first
// (a fresh one on a clean agent, the existing one on a developer machine); the secret is never printed.
// The same command runs locally and in Azure Pipelines.
//
//   node scripts/ci/skeleton-smoke.mjs [--keep]      # --keep leaves Docker running afterwards
//
// Needs Docker, the .NET SDK, Node >= 24 and `npm ci` already run in apps/web-customer and services/graphql-bff.
// Logs: artifacts/skeleton/*.log. Playwright JUnit: artifacts/skeleton/playwright-junit.xml. Exit code: the test run's.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, createWriteStream, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, 'artifacts', 'skeleton');
mkdirSync(out, { recursive: true });
const keep = process.argv.includes('--keep');
const isWin = process.platform === 'win32';

// The Cosmos emulator's documented, publicly known fixed key (not a secret). Override with Cosmos__ConnectionString.
const EMULATOR_KEY = 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==';
const cosmos =
  process.env.Cosmos__ConnectionString ?? `AccountEndpoint=http://localhost:8081/;AccountKey=${EMULATOR_KEY}`;
const ports = { catalog: 5200, ordering: 5300, bff: 4100, web: 3000 };
const bffUrl = `http://localhost:${ports.bff}/graphql`;

/** A value from the git-ignored `.env` that scripts/dev/init-env.mjs writes. Never logged. */
function envValue(key) {
  const text = readFileSync(path.join(root, '.env'), 'utf8');
  const match = new RegExp(`^${key}=(.+)$`, 'm').exec(text);
  if (!match) throw new Error(`${key} is not in .env; scripts/dev/init-env.mjs should have created it`);
  return match[1].trim();
}

const children = [];
const log = (m) => console.log(`[skeleton] ${m}`);

function run(label, cmd, args, opts = {}) {
  log(`${label}: ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts, env: { ...process.env, ...opts.env } });
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status ?? r.signal})`);
}

function start(name, cmd, args, opts) {
  const file = createWriteStream(path.join(out, `${name}.log`));
  const child = spawn(cmd, args, {
    cwd: root,
    ...opts,
    env: { ...process.env, ...opts.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !isWin,
  });
  child.stdout.pipe(file);
  child.stderr.pipe(file);
  child.on('exit', (code) => log(`${name} exited (${code})`));
  children.push({ name, child });
  return child;
}

function stopAll() {
  for (const { name, child } of children) {
    if (child.exitCode !== null || !child.pid) continue;
    log(`stopping ${name}`);
    if (isWin) spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)]);
    else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
  }
}

async function waitFor(name, url, seconds = 120) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return log(`${name} is up`);
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${name} did not become healthy at ${url} within ${seconds}s (see artifacts/skeleton/${name}.log)`);
}

const web = path.join(root, 'apps', 'web-customer');
const bff = path.join(root, 'services', 'graphql-bff');
let exitCode = 1;
try {
  // The ordering service calls the catalog as itself (client credentials, ADR-0018). The mock issuer (started by compose) registers that client
  // from the same .env secret that ordering-service is given below, so this must run before compose. Locally an existing secret is kept.
  run('local secrets', 'node', ['scripts/dev/init-env.mjs']);
  run('compose up', 'docker', ['compose', 'up', '-d', '--build']);
  run('environment check', 'node', ['scripts/dev/check-env.mjs', '--wait', '180']);
  run('seed', 'dotnet', ['run', '--project', 'tools/BakeryMarketplace.Seed'], {
    env: { Cosmos__ConnectionString: cosmos },
  });

  start('catalog', 'dotnet', ['run', '--no-launch-profile', '--project', 'services/catalog-service/src'], {
    env: {
      ASPNETCORE_ENVIRONMENT: 'Development',
      ASPNETCORE_URLS: `http://localhost:${ports.catalog}`,
      Data__Backend: 'cosmos',
      Events__Backend: 'redis',
      Redis__ConnectionString: '127.0.0.1:6379',
      Cosmos__ConnectionString: cosmos,
    },
  });
  start('ordering', 'dotnet', ['run', '--no-launch-profile', '--project', 'services/ordering-service/src'], {
    env: {
      ASPNETCORE_ENVIRONMENT: 'Development', // appsettings.Development.json supplies the authority, the catalog URL and the service-auth settings
      ASPNETCORE_URLS: `http://localhost:${ports.ordering}`,
      Data__Backend: 'cosmos',
      Events__Backend: 'redis',
      Redis__ConnectionString: '127.0.0.1:6379',
      Cosmos__ConnectionString: cosmos,
      ServiceAuth__ClientSecret: envValue('ORDERING_CLIENT_SECRET'),
    },
  });
  start('bff', 'node', ['src/main.ts'], {
    cwd: bff,
    env: {
      BFF_PORT: String(ports.bff),
      CATALOG_URL: `http://localhost:${ports.catalog}`,
      ORDERING_URL: `http://localhost:${ports.ordering}`,
      ENABLE_TEST_HOOKS: '1', // forwards the declined-payment hook (D-10) so the journey can test it; never set outside tests
    },
  });
  await waitFor('catalog', `http://localhost:${ports.catalog}/health`);
  await waitFor('ordering', `http://localhost:${ports.ordering}/health`);
  await waitFor('bff', `http://localhost:${ports.bff}/healthz`);

  // GRAPHQL_URL is read at build time (rewrite) and at run time (SSR), so it is set for both.
  // NEXT_DIST_DIR keeps this build (aimed at the real BFF) out of `.next`, which the mock-backed e2e uses.
  const webEnv = { GRAPHQL_URL: bffUrl, NEXT_DIST_DIR: '.next-skeleton' };
  // The Relay artifacts (src/__generated__) are gitignored, so a clean checkout has none and `next build` fails type-checking
  // without them. This is what `npm run relay` does; run directly so no npm/shell is needed.
  run('relay compile', 'node', ['scripts/ensure-artifact-dir.mjs'], { cwd: web });
  run('relay compile', 'node', [path.join('node_modules', 'relay-compiler', 'cli.js')], { cwd: web });
  run('web build', 'node', [path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
    cwd: web,
    env: webEnv,
  });
  start('web', 'node', [path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(ports.web)], {
    cwd: web,
    env: webEnv,
  });
  await waitFor('web', `http://localhost:${ports.web}/`);

  const pw = spawnSync(
    'node',
    [
      path.join('node_modules', '@playwright', 'test', 'cli.js'),
      'test',
      '-c',
      'playwright.skeleton.config.ts',
      '--reporter=list,junit',
    ],
    {
      cwd: web,
      stdio: 'inherit',
      env: { ...process.env, ...webEnv, PLAYWRIGHT_JUNIT_OUTPUT_NAME: path.join(out, 'playwright-junit.xml') },
    },
  );
  exitCode = pw.status ?? 1;
  log(`Playwright exit code ${exitCode}`);
} catch (e) {
  console.error(`[skeleton] ERROR: ${e.message}`);
} finally {
  stopAll();
  if (!keep) spawnSync('docker', ['compose', 'down'], { cwd: root, stdio: 'inherit' });
}
process.exitCode = exitCode;
