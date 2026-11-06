// Generates docs/product/backlog/STATUS.md from the work-item specs, the epic files, the ADRs and the open-items register.
// The status of a spec is the word after "Status:" in the banner on its first line (docs/method/status-and-supersession.md).
//
//   node scripts/docs/status.mjs           # write STATUS.md
//   node scripts/docs/status.mjs --check   # write nothing; exit 1 if a spec has no banner, a header disagrees with its banner,
//                                          # an epic banner disagrees with its items, or STATUS.md is out of date
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const backlog = path.join(root, 'docs', 'product', 'backlog');
const adrDir = path.join(root, 'docs', 'architecture', 'adr');
const register = path.join(root, 'docs', 'governance', 'open-items-register.md');
const out = path.join(backlog, 'STATUS.md');
const check = process.argv.includes('--check');

const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const STATUSES = [
  'Done',
  'In progress',
  'In review',
  'Built',
  'Ready',
  'Proposed',
  'Blocked',
  'Deferred',
  'Superseded',
  'Obsolete',
];
const problems = [];

const specs = [];
for (const f of readdirSync(backlog)
  .filter((n) => /^WI-[A-Z]+-\d+\.md$/.test(n))
  .sort()) {
  const text = read(path.join(backlog, f));
  const id = f.slice(3, -3);
  const banner = /^> \*\*Status:\*\* (.+)$/m.exec(text.split('\n')[0]);
  if (!banner) {
    problems.push(`${f}: no status banner on line 1`);
    continue;
  }
  const status = STATUSES.find((s) => banner[1] === s || banner[1].startsWith(s + ' '));
  if (!status) {
    problems.push(`${f}: banner status is not in the vocabulary: ${banner[1].slice(0, 40)}`);
    continue;
  }
  const header = /^Status:\s+(.+)$/m.exec(text)?.[1].trim();
  if (header !== status) problems.push(`${f}: header Status "${header}" differs from banner "${status}"`);
  const title =
    /^Title:\s+(.+)$/m.exec(text)?.[1].trim() ?? /^# (?:WI-[A-Z]+-\d+\s*[—-]+\s*)?(.+)$/m.exec(text)?.[1].trim() ?? '';
  const epic = /^Epic:\s+(\S+)/m.exec(text)?.[1] ?? '';
  const detail = banner[1].slice(status.length).replace(/^\s*[·]\s*/, '');
  specs.push({ id, title, epic, status, detail });
}

const count = (items, key) => {
  const m = new Map();
  for (const i of items) m.set(i[key], (m.get(i[key]) ?? 0) + 1);
  return m;
};
const byStatus = count(specs, 'status');

// Epics: derived from the specs. "Superseded" and "Obsolete" items are not counted.
const epics = new Map();
for (const s of specs) {
  if (!epics.has(s.epic)) epics.set(s.epic, []);
  epics.get(s.epic).push(s);
}
const epicLine = (items) => {
  const counted = items.filter((i) => i.status !== 'Superseded' && i.status !== 'Obsolete');
  const done = counted.filter((i) => i.status === 'Done').length;
  return { done, total: counted.length };
};
for (const f of readdirSync(backlog).filter((n) => /^EPIC-[A-Z-]+\.md$/.test(n))) {
  const name = f.slice(0, -3);
  const banner = /^> \*\*Status:\*\* (\d+) of (\d+) items/.exec(read(path.join(backlog, f)).split('\n')[0]);
  if (!banner) {
    problems.push(`${f}: no "N of M items" banner on line 1`);
    continue;
  }
  const d = epicLine(epics.get(name) ?? []);
  if (Number(banner[1]) !== d.done || Number(banner[2]) !== d.total)
    problems.push(`${f}: banner says ${banner[1]} of ${banner[2]}, the specs give ${d.done} of ${d.total}`);
}

// The epic catalog names a spec's status in one regular form: `WI-X.md` (Status, date). That form must agree with the banner. Other prose
// mentions of a status (in the catalog, scope.md, the plans) are free text and are not checked (register item 99).
const catalogMentions = [
  ...read(path.join(backlog, 'epic-catalog.md')).matchAll(
    /`(WI-[A-Z]+-\d+)\.md` \(([A-Za-z ]+?), \d{4}-\d{2}-\d{2}\)/g,
  ),
];
for (const [, wi, said] of catalogMentions) {
  const spec = specs.find((x) => `WI-${x.id}` === wi);
  if (spec && spec.status !== said)
    problems.push(`epic-catalog.md: ${wi}.md is marked "${said}" but its banner says "${spec.status}"`);
}

// ADRs: the first word(s) of the status line.
const adrs = readdirSync(adrDir)
  .filter((n) => /^\d{4}-.+\.md$/.test(n))
  .sort()
  .map((f) => {
    const text = read(path.join(adrDir, f));
    const title = /^# (?:ADR-\d+\s*[—:-]+\s*)?(.+)$/m.exec(text)?.[1].trim() ?? f;
    const line = (/^\*\*Status:\*\*\s*(.+)$/m.exec(text)?.[1].trim() ?? '(no status line)').replace(
      /\[([^\]]+)\]\([^)]*\)/g,
      '$1',
    );
    const word = /^(Accepted|Proposed|Superseded|Deprecated)/.exec(line)?.[1] ?? '(unclear)';
    return { n: f.slice(0, 4), file: f, title, word, line };
  });

// Register: numbered items and their Type. A Status field is added by the register clean-up; until then only counts are possible.
const regText = read(register);
const items = [...regText.matchAll(/^\*\*(\d+)\. (.+)\n(Type: ([^·\n]+))?/gm)].map((m) => ({
  n: Number(m[1]),
  title: m[2],
  type: m[4]?.trim() ?? (/Resolved/.test(m[2]) ? 'Resolved (collapsed entry)' : '(no Type line)'),
}));
const regStatus = [...regText.matchAll(/^Status: (\w+)/gm)].map((m) => m[1]);

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const lines = [];
lines.push('# Status', '');
lines.push(
  '> **Status:** Generated by `node scripts/docs/status.mjs`. Do not edit by hand: edit the banner on the spec (or the ADR status line) and run the script. `--check` fails when a spec has no banner or when this file is out of date.',
  '',
);
lines.push('Status words are defined in `docs/method/status-and-supersession.md`.', '');
lines.push('## Work items', '');
lines.push(`${specs.length} specs.`, '');
lines.push('| Status | Count |', '|---|---|');
for (const s of STATUSES) if (byStatus.has(s)) lines.push(`| ${s} | ${byStatus.get(s)} |`);
lines.push('', '## Epics (derived from the specs)', '', 'Superseded and obsolete items are not counted.', '');
lines.push('| Epic | Done | Items |', '|---|---|---|');
for (const [name, list] of [...epics].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
  const d = epicLine(list);
  lines.push(`| ${name} | ${d.done} of ${d.total} | ${list.map((i) => i.id).join(', ')} |`);
}
lines.push('', 'Epics with no spec yet are listed, with their planned items, in `epic-catalog.md`.', '');
lines.push('## Specs', '', '| ID | Title | Epic | Status | Detail |', '|---|---|---|---|---|');
for (const s of specs)
  lines.push(`| [${s.id}](WI-${s.id}.md) | ${cell(s.title)} | ${s.epic} | ${s.status} | ${cell(s.detail)} |`);
lines.push('', '## Architecture decisions', '', `${adrs.length} records.`, '');
lines.push('| ADR | Title | Status | Status line |', '|---|---|---|---|');
for (const a of adrs)
  lines.push(
    `| [${a.n}](../../architecture/adr/${a.file}) | ${cell(a.title)} | ${a.word} | ${cell(a.line.length > 110 ? a.line.slice(0, 107) + '...' : a.line)} |`,
  );
const adrCounts = count(adrs, 'word');
lines.push('', [...adrCounts].map(([k, v]) => `${k}: ${v}`).join(' · '), '');
lines.push('## Open-items register', '');
lines.push(
  `${items.length} numbered items in \`docs/governance/open-items-register.md\` (highest number ${Math.max(...items.map((i) => i.n))}).`,
  '',
);
lines.push('| Type | Count |', '|---|---|');
for (const [t, c] of [...count(items, 'type')].sort((a, b) => b[1] - a[1])) lines.push(`| ${cell(t)} | ${c} |`);
if (regStatus.length) {
  lines.push('', '| Item status | Count |', '|---|---|');
  for (const [t, c] of [
    ...count(
      regStatus.map((s) => ({ s })),
      's',
    ),
  ])
    lines.push(`| ${t} | ${c} |`);
} else {
  lines.push('', 'Items have no `Status:` field yet, so open and resolved counts cannot be generated.');
}
lines.push('');
const generated = lines.join('\n');

if (check) {
  const current = existsSync(out) ? read(out) : '';
  if (current !== generated) problems.push('STATUS.md is out of date: run node scripts/docs/status.mjs');
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`status check passed: ${specs.length} specs, ${adrs.length} ADRs, ${items.length} register items`);
} else {
  writeFileSync(out, generated);
  if (problems.length) console.error(problems.join('\n'));
  console.log(
    `wrote ${path.relative(root, out)}: ${specs.length} specs, ${adrs.length} ADRs, ${items.length} register items`,
  );
  if (problems.length) process.exit(1);
}
