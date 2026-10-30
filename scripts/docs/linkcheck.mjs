import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const root = process.argv[2];
const files = execSync('git ls-files "*.md"', { cwd: root }).toString().trim().split('\n');
const tracked = new Set(execSync('git ls-files', { cwd: root }).toString().trim().split('\n'));
const dirs = new Set();
for (const f of tracked) { let d = dirname(f); while (d !== '.' && !dirs.has(d)) { dirs.add(d); d = dirname(d); } }

const broken = [];
const stale = {
  'Azure AD B2C': /Azure AD B2C/,
  'Static Web Apps': /Static Web Apps/,
  'validation pending': /validation pending/i,
  'Scaffold only': /Scaffold only/i,
  'docker-compose up': /docker-compose up/,
};
const staleHits = Object.fromEntries(Object.keys(stale).map((k) => [k, new Set()]));
let linkCount = 0, pathCount = 0;
const exists = (p) => tracked.has(p) || dirs.has(p);

for (const f of files) {
  const text = readFileSync(join(root, f), 'utf8');
  for (const [k, re] of Object.entries(stale)) if (re.test(text)) staleHits[k].add(f);
  const noCode = text.replace(/```[\s\S]*?```/g, '');
  for (const m of noCode.matchAll(/\]\(([^)\s]+)\)/g)) {
    let t = m[1];
    if (/^(https?:|mailto:|#)/.test(t)) continue;
    t = t.split('#')[0]; if (!t) continue;
    linkCount++;
    const p = normalize(join(dirname(f), decodeURIComponent(t))).replace(/\\/g, '/');
    if (!exists(p)) broken.push([f, 'link', m[1]]);
  }
  for (const m of noCode.matchAll(/`([A-Za-z0-9_.\-\/]+\.(?:md|mjs|cs|csproj|yml|yaml|json|ts|tsx|tf|slnx))`/g)) {
    const t = m[1];
    if (!t.includes('/')) continue;
    pathCount++;
    const cands = [normalize(join(dirname(f), t)), normalize(t), normalize(t.replace(/^\//, ''))].map((x) => x.replace(/\\/g, '/'));
    if (!cands.some(exists)) broken.push([f, 'path', t]);
  }
}
console.log(JSON.stringify({ files: files.length, linkCount, pathCount, brokenLinks: broken.filter((b) => b[1] === 'link').length, brokenPaths: broken.filter((b) => b[1] === 'path').length }));
console.log('STALE');
for (const [k, s] of Object.entries(staleHits)) console.log(k, s.size);
const out = process.argv[3];
import('node:fs').then((fs) => fs.writeFileSync(out, JSON.stringify({ broken, stale: Object.fromEntries(Object.entries(staleHits).map(([k, s]) => [k, [...s]])) }, null, 1)));
