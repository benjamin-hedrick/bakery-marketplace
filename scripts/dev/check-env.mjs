// Readiness check for the local environment (WI-DEV-002): "is the environment up", nothing more.
//
//   node scripts/dev/check-env.mjs [--with-redis] [--wait <seconds>]
//
// Exits 0 when every default service answers, 1 otherwise. With --wait it retries until the deadline,
// so it can be run straight after `docker compose up -d`. Ports follow the same variables as docker-compose.yml.
import net from 'node:net';

const args = process.argv.slice(2);
const withRedis = args.includes('--with-redis');
const waitIdx = args.indexOf('--wait');
const waitSeconds = waitIdx >= 0 ? Number(args[waitIdx + 1] ?? 0) : 0;

const port = (name, fallback) => Number(process.env[name] ?? fallback);
const ports = {
  events: port('REDIS_EVENTS_PORT', 6379),
  cosmos: port('COSMOS_PORT', 8081),
  oidc: port('MOCK_OIDC_PORT', 5100),
  cache: port('REDIS_CACHE_PORT', 6380),
};

/** Sends a Redis PING and expects +PONG: proves it is Redis, not just any listener on the port. */
function redisPing(p) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: p, timeout: 2000 });
    let data = '';
    socket.on('connect', () => socket.write('PING\r\n'));
    socket.on('data', (d) => {
      data += d;
      if (data.includes('\r\n')) socket.end();
    });
    socket.on('end', () =>
      data.startsWith('+PONG') ? resolve('PONG') : reject(new Error(`unexpected reply: ${JSON.stringify(data)}`)),
    );
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('timeout'));
    });
    socket.on('error', reject);
  });
}

async function http(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
  return res;
}

const checks = [
  { name: 'event backbone (Redis Streams)', target: `127.0.0.1:${ports.events}`, run: () => redisPing(ports.events) },
  {
    // Any HTTP answer (even 4xx) proves the emulator process is listening and speaking HTTP.
    name: 'Cosmos DB emulator',
    target: `http://127.0.0.1:${ports.cosmos}`,
    run: async () => `HTTP ${(await http(`http://127.0.0.1:${ports.cosmos}/`)).status}`,
  },
  {
    name: 'mock OIDC issuer',
    target: `http://localhost:${ports.oidc}`,
    run: async () => {
      const res = await http(`http://localhost:${ports.oidc}/.well-known/openid-configuration`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const issuer = (await res.json()).issuer;
      return `issuer ${issuer}`;
    },
  },
];
if (withRedis) {
  checks.push({
    name: 'cache Redis (profile with-redis)',
    target: `127.0.0.1:${ports.cache}`,
    run: () => redisPing(ports.cache),
  });
}

const deadline = Date.now() + waitSeconds * 1000;
const results = new Map();
do {
  for (const c of checks) {
    if (results.get(c.name)?.ok) continue;
    try {
      results.set(c.name, { ok: true, detail: await c.run() });
    } catch (e) {
      results.set(c.name, { ok: false, detail: e.cause?.code ?? e.message });
    }
  }
  if ([...results.values()].every((r) => r.ok)) break;
  if (Date.now() < deadline) await new Promise((r) => setTimeout(r, 2000));
} while (Date.now() < deadline);

let allOk = true;
for (const c of checks) {
  const r = results.get(c.name);
  allOk &&= r.ok;
  console.log(`${r.ok ? 'UP  ' : 'DOWN'}  ${c.name.padEnd(34)} ${c.target}  ${r.detail}`);
}
console.log(allOk ? '\nEnvironment is up.' : '\nEnvironment is NOT fully up.');
// Set the exit code and let the event loop drain: calling process.exit() while sockets are still closing
// crashes Node on Windows (libuv assertion, exit 127) even when every check passed.
process.exitCode = allOk ? 0 : 1;
