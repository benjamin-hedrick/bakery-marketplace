// Concurrent-request isolation check (WI-PORT-001 acceptance: "concurrent SSR requests with different
// fixtures cannot leak data"). Run against a production build with ENABLE_TEST_HOOKS=1 and the mock up.
//
//   node scripts/ssr-isolation.mjs [baseUrl] [requestCount]
//
// Each request asks for fixture A or B and a random upstream delay so responses interleave. A response
// passes only if it contains every name from its own fixture and none from the other fixture, in the
// rendered HTML and in the embedded __NEXT_DATA__ payload.
import { fixtures } from '../mock-bff/fixtures.mjs';

const base = process.argv[2] ?? 'http://localhost:3000';
const total = Number(process.argv[3] ?? 200);

const names = (k) => fixtures[k].map((l) => l.name);
const ids = (k) => fixtures[k].map((l) => l.id);
const other = { A: 'B', B: 'A' };

async function one(i) {
  const fixture = i % 2 === 0 ? 'A' : 'B';
  const delay = Math.floor(Math.random() * 250);
  const res = await fetch(`${base}/`, { headers: { 'x-fixture': fixture, 'x-delay-ms': String(delay) } });
  const html = await res.text();
  const problems = [];
  if (res.status !== 200) problems.push(`status ${res.status}`);
  for (const n of names(fixture)) if (!html.includes(n)) problems.push(`missing own name "${n}"`);
  for (const n of names(other[fixture])) if (html.includes(n)) problems.push(`LEAK: other fixture name "${n}"`);
  const data = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '';
  for (const id of ids(other[fixture])) if (data.includes(id)) problems.push(`LEAK: other fixture id in __NEXT_DATA__`);
  return { i, fixture, problems };
}

const started = Date.now();
const results = await Promise.all(Array.from({ length: total }, (_, i) => one(i)));
const failed = results.filter((r) => r.problems.length);

console.log(
  `requests=${total} fixtureA=${results.filter((r) => r.fixture === 'A').length} fixtureB=${results.filter((r) => r.fixture === 'B').length} elapsedMs=${Date.now() - started}`,
);
if (failed.length) {
  for (const f of failed.slice(0, 10)) console.log(`FAIL #${f.i} (${f.fixture}): ${f.problems.join('; ')}`);
  console.log(`FAILED: ${failed.length}/${total}`);
  process.exit(1);
}
console.log(`PASS: ${total}/${total} responses contained only their own fixture`);
