// Proves a test run really reached Redis (reconciliation finding A8: the Redis adapter tests fall back to
// in-memory fakes without saying so, and a green run proves nothing about the real adapter when that happens).
//
//   node scripts/ci/redis-touch.mjs snapshot <file> [host:port]
//   node scripts/ci/redis-touch.mjs assert   <file> <minimum-commands> [host:port]
//
// `snapshot` records Redis's lifetime command counter; `assert` fails (exit 1) unless the counter grew by at least
// <minimum-commands> since the snapshot. Run the Redis-backed test projects between the two. Needs a Redis nothing else is using.
import net from 'node:net';
import { readFileSync, writeFileSync } from 'node:fs';

const [mode, file, ...rest] = process.argv.slice(2);
const min = mode === 'assert' ? Number(rest.shift()) : 0;
const [host, port] = (rest[0] ?? process.env.REDIS_CONNECTION_STRING ?? '127.0.0.1:6379').split(':');

function commandsProcessed() {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port: Number(port), timeout: 3000 });
    let data = '';
    socket.on('connect', () => socket.write('INFO stats\r\n'));
    socket.on('data', (d) => {
      data += d;
      const m = /total_commands_processed:(\d+)/.exec(data);
      if (m) { socket.end(); resolve(Number(m[1])); }
    });
    socket.on('timeout', () => { socket.destroy(); reject(new Error(`timeout talking to ${host}:${port}`)); });
    socket.on('error', reject);
  });
}

try {
  const now = await commandsProcessed();
  if (mode === 'snapshot') {
    writeFileSync(file, String(now));
    console.log(`Redis ${host}:${port} reachable; command counter ${now}.`);
  } else if (mode === 'assert') {
    const before = Number(readFileSync(file, 'utf8'));
    const grew = now - before;
    if (grew < min) {
      console.error(`FAIL: Redis saw ${grew} commands during the tests (needed >= ${min}). The adapter tests probably fell back to in-memory fakes.`);
      process.exitCode = 1;
    } else {
      console.log(`OK: Redis ${host}:${port} processed ${grew} commands during the tests, so they ran against the real adapter.`);
    }
  } else {
    console.error('usage: redis-touch.mjs snapshot|assert <file> ...');
    process.exitCode = 2;
  }
} catch (e) {
  console.error(`FAIL: cannot reach Redis at ${host}:${port}: ${e.message}`);
  process.exitCode = 1;
}
