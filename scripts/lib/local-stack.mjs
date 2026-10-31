// The local slice-1 stack, shared by scripts/ci/skeleton-smoke.mjs (starts it, runs the browser journeys, tears down) and
// scripts/dev/demo.mjs (starts it, waits for a person). Docker Compose runs Redis Streams, the Cosmos emulator and the mock issuer;
// the catalog service, the ordering service, the GraphQL BFF and the Next.js app run as host processes.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, createWriteStream, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ports = { catalog: 5200, ordering: 5300, bff: 4100, web: 3000 };
export const issuerUrl = 'http://localhost:5100';
export const bffUrl = `http://localhost:${ports.bff}/graphql`;
const isWin = process.platform === 'win32';

// The Cosmos emulator's documented, publicly known fixed key (not a secret). Override with Cosmos__ConnectionString.
const EMULATOR_KEY = 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==';
export const cosmos =
  process.env.Cosmos__ConnectionString ?? `AccountEndpoint=http://localhost:8081/;AccountKey=${EMULATOR_KEY}`;

/** A value from the git-ignored `.env` that scripts/dev/init-env.mjs writes. Never logged. */
function envValue(key) {
  const text = readFileSync(path.join(root, '.env'), 'utf8');
  const match = new RegExp(`^${key}=(.+)$`, 'm').exec(text);
  if (!match) throw new Error(`${key} is not in .env; scripts/dev/init-env.mjs should have created it`);
  return match[1].trim();
}

/**
 * @param {object} o
 * @param {string} o.label     prefix of every log line, e.g. "skeleton"
 * @param {string} o.outDir    folder under the repository root for the process logs, e.g. "artifacts/skeleton"
 * @param {string} o.distDir   the Next.js build folder for this use, so it cannot overwrite `.next` (the mock-backed e2e build)
 * @param {boolean} [o.logExits] log each process's exit
 */
export function createStack({ label, outDir, distDir, logExits = false }) {
  const out = path.join(root, outDir);
  mkdirSync(out, { recursive: true });
  const children = [];
  const log = (m) => console.log(`[${label}] ${m}`);
  const web = path.join(root, 'apps', 'web-customer');
  const bff = path.join(root, 'services', 'graphql-bff');
  const next = path.join('node_modules', 'next', 'dist', 'bin', 'next');
  // GRAPHQL_URL is read at build time (rewrite) and at run time (SSR), so it is set for both.
  const webEnv = { GRAPHQL_URL: bffUrl, NEXT_DIST_DIR: distDir };

  function run(name, cmd, args, opts = {}) {
    log(`${name}: ${cmd} ${args.join(' ')}`);
    const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts, env: { ...process.env, ...opts.env } });
    if (r.status !== 0) throw new Error(`${name} failed (exit ${r.status ?? r.signal})`);
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
    if (logExits) child.on('exit', (code) => log(`${name} exited (${code})`));
    children.push({ name, child });
    return child;
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
    throw new Error(`${name} did not become healthy at ${url} within ${seconds}s (see ${outDir}/${name}.log)`);
  }

  return {
    out,
    log,
    webEnv,
    webDir: web,

    /** Local secrets, Compose infrastructure, a check that it is up, and the seed. */
    up() {
      // The ordering service calls the catalog as itself (client credentials, ADR-0018). The mock issuer (started by compose) registers that
      // client from the same .env secret that ordering-service is given, so the secrets must exist before compose. An existing one is kept.
      run('local secrets', 'node', ['scripts/dev/init-env.mjs']);
      run('compose up', 'docker', ['compose', 'up', '-d', '--build']);
      run('environment check', 'node', ['scripts/dev/check-env.mjs', '--wait', '180']);
      run('seed', 'dotnet', ['run', '--project', 'tools/BakeryMarketplace.Seed'], {
        env: { Cosmos__ConnectionString: cosmos },
      });
    },

    /** The catalog service, the ordering service and the BFF, each waited for. `testHooks` forwards the declined-payment hook (D-10): tests only. */
    async startServices({ testHooks = false } = {}) {
      const dotnetEnv = {
        ASPNETCORE_ENVIRONMENT: 'Development', // appsettings.Development.json supplies the authority, the catalog URL and the service-auth settings
        Data__Backend: 'cosmos',
        Events__Backend: 'redis',
        Redis__ConnectionString: '127.0.0.1:6379',
        Cosmos__ConnectionString: cosmos,
      };
      start('catalog', 'dotnet', ['run', '--no-launch-profile', '--project', 'services/catalog-service/src'], {
        env: { ...dotnetEnv, ASPNETCORE_URLS: `http://localhost:${ports.catalog}` },
      });
      start('ordering', 'dotnet', ['run', '--no-launch-profile', '--project', 'services/ordering-service/src'], {
        env: {
          ...dotnetEnv,
          ASPNETCORE_URLS: `http://localhost:${ports.ordering}`,
          ServiceAuth__ClientSecret: envValue('ORDERING_CLIENT_SECRET'),
        },
      });
      start('bff', 'node', ['src/main.ts'], {
        cwd: bff,
        env: {
          BFF_PORT: String(ports.bff),
          CATALOG_URL: `http://localhost:${ports.catalog}`,
          ORDERING_URL: `http://localhost:${ports.ordering}`,
          ...(testHooks ? { ENABLE_TEST_HOOKS: '1' } : {}),
        },
      });
      await waitFor('catalog', `http://localhost:${ports.catalog}/health`);
      await waitFor('ordering', `http://localhost:${ports.ordering}/health`);
      await waitFor('bff', `http://localhost:${ports.bff}/healthz`);
    },

    /**
     * The four application containers (compose profile `apps`, the images the cloud dev environment uses) in place of startServices and
     * startWeb. The web image is built with the BFF address of the Compose network, so the browser reaches it through the same-origin rewrite.
     */
    async startContainers({ testHooks = false } = {}) {
      run('app containers', 'docker', ['compose', '--profile', 'apps', 'up', '-d', '--build'], {
        env: testHooks ? { ENABLE_TEST_HOOKS: '1' } : {},
      });
      await waitFor('catalog', `http://localhost:${ports.catalog}/health`);
      await waitFor('ordering', `http://localhost:${ports.ordering}/health`);
      await waitFor('bff', `http://localhost:${ports.bff}/healthz`);
      await waitFor('web', `http://localhost:${ports.web}/`);
    },

    /** Builds the Next.js app against the real BFF and starts it. */
    async startWeb() {
      // The Relay artifacts (src/__generated__) are gitignored, so a clean checkout has none and `next build` fails type-checking
      // without them. This is what `npm run relay` does; run directly so no npm/shell is needed.
      run('relay compile', 'node', ['scripts/ensure-artifact-dir.mjs'], { cwd: web });
      run('relay compile', 'node', [path.join('node_modules', 'relay-compiler', 'cli.js')], { cwd: web });
      run('web build', 'node', [next, 'build'], { cwd: web, env: webEnv });
      start('web', 'node', [next, 'start', '-p', String(ports.web)], { cwd: web, env: webEnv });
      await waitFor('web', `http://localhost:${ports.web}/`);
    },

    stopAll() {
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
    },

    /** Stops the Compose containers and removes them (their data is lost). */
    down() {
      // --profile apps so the application containers are removed too (a no-op when they were not started).
      spawnSync('docker', ['compose', '--profile', 'apps', 'down'], { cwd: root, stdio: 'inherit' });
    },
  };
}
