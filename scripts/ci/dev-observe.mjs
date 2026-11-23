#!/usr/bin/env node
// Observability evidence of a dev run (WI-DEP-001, register 221): what the platform saw while the smoke ran. Runs in the dev pipeline's observe stage as
// the read-only bakery-plan identity (Reader), after the smoke, whether the smoke passed or failed:
//
//   node scripts/ci/dev-observe.mjs --resource-group rg-bakery-dev --workspace log-bakery-dev --deployment dev-deployment.json
//        [--correlation correlation-ids.jsonl] --out observe.json
//   node scripts/ci/dev-observe.mjs --resource-group rg-bakery-dev --workspace log-bakery-dev --since <ISO time> --out observe.json   (the lead's sign-in)
//
//   1. Platform metrics of each app for the window (from the deployment to now, one-minute grain): requests, replicas, restarts, CPU, memory.
//   2. The environment's log (Log Analytics, through its query API with "az rest": the log query command needs a CLI extension): console lines and
//      lines that look like errors per app, the platform's system events per app and reason, and every replica start with its duration (coldStarts).
//   3. Which of the smoke's correlation ids (X-Correlation-Id, the trace id, ADR-0016) appear in the apps' console log, and in which app.
//   4. With tracing (WI-OBS-001; the deployment record names a collector, or --traces): the spans Application Insights holds, read from the same
//      workspace (AppRequests and AppDependencies): spans and failures per app, the spans of each smoke trace (which apps, how many, the longest),
//      and the spans of each trace in which a chaos layer injected a fault. Waits for the spans to land (some minutes after they are sent).
// Only counts, reasons and ids are kept, never a log line's text (it could hold a customer's details). A metric or query that fails is recorded as
// failed with its message, and the others still run: the point is to see what is and is not observable. Exit code 0 = written (even with failures
// recorded), 1 = nothing could be read, 2 = bad usage.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APPS = ['web', 'graphql-bff', 'catalog', 'ordering', 'mock-oidc'];

/** The metrics asked for, each with the aggregation that answers the question (Container Apps metric names). */
export const METRICS = [
  { name: 'Requests', aggregation: 'Total' },
  { name: 'Replicas', aggregation: 'Maximum' },
  { name: 'RestartCount', aggregation: 'Maximum' },
  { name: 'UsageNanoCores', aggregation: 'Maximum' },
  { name: 'WorkingSetBytes', aggregation: 'Maximum' },
];

const kql = (s) => s.replace(/'/g, "\\'");

/** The log queries for the window. Ids are 32 hex characters (checked), so they are safe inside the query text. */
export function queries(start, end, ids = [], { traces = false } = {}) {
  const window = `TimeGenerated between (datetime('${kql(start)}') .. datetime('${kql(end)}'))`;
  const safeIds = ids.filter((id) => /^[0-9a-f]{32}$/.test(id));
  const list = safeIds.map((id) => `'${id}'`).join(', ');
  const q = {
    consoleLinesPerApp: `ContainerAppConsoleLogs_CL | where ${window} | summarize lines = count() by app = ContainerAppName_s`,
    errorLikeLinesPerApp:
      `ContainerAppConsoleLogs_CL | where ${window} | where Log_s has_any ('error', 'fail', 'exception', 'unhandled') ` +
      `| summarize lines = count() by app = ContainerAppName_s`,
    systemEventsPerAppAndReason: `ContainerAppSystemLogs_CL | where ${window} | summarize events = count() by app = ContainerAppName_s, reason = Reason_s`,
    // Every replica start (register 228): from the platform assigning a replica to its container starting, per app. A deploy's new revision and a
    // wake from zero both start one; the app's own start-up comes after this (the warm-up's client times include it).
    coldStarts:
      `ContainerAppSystemLogs_CL | where ${window} | where Reason_s in ('AssigningReplica', 'ContainerStarted') ` +
      `| project t = TimeGenerated, app = ContainerAppName_s, reason = Reason_s | order by app asc, t asc | serialize ` +
      `| extend prevReason = prev(reason), prevT = prev(t), prevApp = prev(app) ` +
      `| where reason == 'ContainerStarted' and prevReason == 'AssigningReplica' and prevApp == app and isnotempty(app) ` +
      `| project app, assigned = prevT, containerStarted = t, seconds = round(datetime_diff('millisecond', t, prevT) / 1000.0, 1) | order by assigned asc`,
    // Chaos in the deployed dev stack (ADR-0024, WI-CHAOS-006): which apps started with a scenario on, and the faults each injected, counted by layer
    // and fault. The .NET journal writes "chaos injected: layer=... fault=..." and the Node one a JSON line with "layer" and "fault"; the key and the
    // trace id on those lines are not kept, only the counts (decision 8's summary).
    chaosScenariosOn:
      `ContainerAppConsoleLogs_CL | where ${window} | where Log_s has 'CHAOS SCENARIO' ` +
      `| extend scenario = extract("CHAOS SCENARIO '([a-z0-9-]+)' IS ON", 1, Log_s) | where isnotempty(scenario) ` +
      `| summarize starts = count() by app = ContainerAppName_s, scenario`,
    chaosInjected:
      `ContainerAppConsoleLogs_CL | where ${window} | where Log_s has 'chaos injected' ` +
      `| extend layer = coalesce(extract('layer=([a-z-]+)', 1, Log_s), extract('"layer":"([a-z-]+)"', 1, Log_s)), ` +
      `fault = coalesce(extract('fault=([a-z-]+)', 1, Log_s), extract('"fault":"([a-z-]+)"', 1, Log_s)) ` +
      `| where isnotempty(layer) and isnotempty(fault) | summarize faults = count() by app = ContainerAppName_s, layer, fault`,
  };
  if (safeIds.length > 0)
    q.correlationIdsInConsoleLog =
      `ContainerAppConsoleLogs_CL | where ${window} | extend id = extract('([0-9a-f]{32})', 1, Log_s) ` +
      `| where id in (${list}) | summarize lines = count() by id, app = ContainerAppName_s`;
  if (traces) Object.assign(q, traceQueries(window, safeIds));
  return q;
}

/**
 * The trace queries (WI-OBS-001): the spans Application Insights holds, read from the same workspace (it is workspace-based: the apps' spans land in
 * AppRequests, for the server side, and AppDependencies, for the calls out). Only when the stack has tracing, because without it these tables do not
 * exist and every query would fail. Counts, app names, result codes, durations and trace ids only: never a span's name, target, URL or properties.
 * The window is the same as the log's; AppRoleName is the service name each app's exporter sets.
 */
export function traceQueries(window, safeIds) {
  const spans = 'union AppRequests, AppDependencies';
  const q = {
    spansPerApp: `${spans} | where ${window} | summarize spans = count(), failed = countif(Success == false) by app = AppRoleName, kind = itemType`,
    failedSpansPerApp: `${spans} | where ${window} | where Success == false | summarize spans = count() by app = AppRoleName, resultCode = ResultCode`,
    // Each trace id the chaos layers logged when they injected a fault, with the spans of that trace: which apps it crossed, how many spans, how many
    // failed and the longest. The console line carries the trace id (.NET "trace=<id>", Node "traceId":"<id>"); the join keeps only the id, the
    // layer and the fault from it.
    chaosTraces:
      `let chaos = ContainerAppConsoleLogs_CL | where ${window} | where Log_s has 'chaos injected' ` +
      `| extend layer = coalesce(extract('layer=([a-z-]+)', 1, Log_s), extract('"layer":"([a-z-]+)"', 1, Log_s)), ` +
      `fault = coalesce(extract('fault=([a-z-]+)', 1, Log_s), extract('"fault":"([a-z-]+)"', 1, Log_s)), ` +
      `id = coalesce(extract('trace=([0-9a-f]{32})', 1, Log_s), extract('"traceId":"([0-9a-f]{32})"', 1, Log_s)) ` +
      `| where isnotempty(layer) and isnotempty(fault) and isnotempty(id) | distinct id, layer, fault; ` +
      `${spans} | where ${window} | summarize spans = count(), failed = countif(Success == false), longestMs = round(max(DurationMs), 1), ` +
      `apps = make_set(AppRoleName) by id = OperationId | join kind=inner chaos on id | project id, layer, fault, spans, failed, longestMs, apps`,
  };
  if (safeIds.length > 0)
    q.smokeTraces =
      `${spans} | where ${window} | where OperationId in (${safeIds.map((id) => `'${id}'`).join(', ')}) ` +
      `| summarize spans = count(), failed = countif(Success == false), longestMs = round(max(DurationMs), 1), apps = make_set(AppRoleName) by id = OperationId`;
  return q;
}

/** A Log Analytics query API answer as rows of named columns. */
export function rowsOf(answer) {
  const table = answer?.tables?.[0];
  if (!table) return [];
  const names = table.columns.map((c) => c.name);
  return table.rows.map((r) => Object.fromEntries(names.map((n, i) => [n, r[i]])));
}

/** The largest (or summed, for Total) value of one metric's time series. */
export function metricValue(answer, aggregation) {
  const points = (answer?.value?.[0]?.timeseries ?? []).flatMap((t) => t.data ?? []);
  const key = aggregation.toLowerCase();
  const values = points.map((p) => p[key]).filter((v) => typeof v === 'number');
  if (values.length === 0) return null;
  return aggregation === 'Total' ? values.reduce((a, b) => a + b, 0) : Math.max(...values);
}

/** The correlation ids of the smoke run (one JSON object per line), distinct, newest first, at most `limit`. */
export function correlationIds(jsonl, limit = 40) {
  const ids = [];
  for (const line of jsonl.split('\n')) {
    try {
      const id = JSON.parse(line).correlationId;
      if (/^[0-9a-f]{32}$/.test(id) && !ids.includes(id)) ids.push(id);
    } catch {
      // a line that is not JSON is skipped
    }
  }
  return ids.reverse().slice(0, limit);
}

/**
 * Collects the evidence.
 * @param {(args: string[]) => string} az
 */
export function observe(
  { resourceGroup, workspace, start, end, ids, traces = false, maxTraceAttempts = 6, traceWaitMs = 45_000 },
  az,
  wait = () => {},
) {
  const out = { window: { start, end }, metrics: {}, logs: {}, failures: [] };
  const attempt = (what, fn) => {
    try {
      return fn();
    } catch (e) {
      out.failures.push({ what, error: String(e.message).split('\n')[0].slice(0, 300) });
      return undefined;
    }
  };

  for (const app of APPS) {
    const id = attempt(`${app}: resource id`, () =>
      az([
        'containerapp',
        'show',
        '--name',
        app,
        '--resource-group',
        resourceGroup,
        '--query',
        'id',
        '--output',
        'tsv',
      ]).trim(),
    );
    if (!id) continue;
    out.metrics[app] = {};
    for (const m of METRICS) {
      const answer = attempt(`${app}: metric ${m.name}`, () =>
        JSON.parse(
          az([
            'monitor',
            'metrics',
            'list',
            '--resource',
            id,
            '--metrics',
            m.name,
            '--aggregation',
            m.aggregation,
            '--start-time',
            start,
            '--end-time',
            end,
            '--interval',
            'PT1M',
            '--output',
            'json',
          ]),
        ),
      );
      if (answer) out.metrics[app][m.name] = { aggregation: m.aggregation, value: metricValue(answer, m.aggregation) };
    }
  }

  const customerId = attempt('log workspace id', () =>
    az([
      'monitor',
      'log-analytics',
      'workspace',
      'show',
      '--resource-group',
      resourceGroup,
      '--workspace-name',
      workspace,
      '--query',
      'customerId',
      '--output',
      'tsv',
    ]).trim(),
  );
  const ask = (name, query) =>
    attempt(`log query ${name}`, () =>
      rowsOf(
        JSON.parse(
          az([
            'rest',
            '--method',
            'post',
            '--resource',
            'https://api.loganalytics.io',
            '--url',
            `https://api.loganalytics.io/v1/workspaces/${customerId}/query`,
            '--body',
            JSON.stringify({ query }),
            '--output',
            'json',
          ]),
        ),
      ),
    );
  // The trace queries wait for the spans to land (below) when there are smoke ids to look for; with none there is nothing to wait for.
  const waited = new Set(
    traces && ids.length > 0
      ? [
          'smokeTraces',
          'spansPerApp',
          'failedSpansPerApp',
          'chaosTraces',
          'chaosInjected',
          'correlationIdsInConsoleLog',
        ]
      : [],
  );
  if (customerId) {
    for (const [name, query] of Object.entries(queries(start, end, ids, { traces }))) {
      if (waited.has(name)) continue; // asked below, after the wait for the spans
      const rows = ask(name, query);
      if (rows) out.logs[name] = rows;
    }
    if (traces && ids.length > 0) {
      // Spans reach Application Insights some minutes after they are sent (the collector batches, then Azure Monitor ingests), and the observe stage
      // runs straight after the smoke. So the smoke's traces are asked for again, after a wait, until every id has spans, or the count has not grown
      // across two reads (some ids never make a span: the issuer's, the web app's static files), or the attempts are used up. The other trace
      // queries then run once, after it.
      const query = queries(start, end, ids, { traces })['smokeTraces'];
      let previous = -1;
      let attempts = 0;
      let rows;
      while (attempts < maxTraceAttempts) {
        attempts++;
        rows = ask('smokeTraces', query);
        if (!rows) break; // the failure is recorded; waiting will not mend it
        const count = new Set(rows.map((r) => r.id)).size;
        if (count >= ids.length || (count > 0 && count === previous)) break;
        previous = count;
        if (attempts < maxTraceAttempts) wait(traceWaitMs);
      }
      if (rows) out.logs.smokeTraces = rows;
      out.traceAttempts = attempts;
      const rest = queries(start, end, ids, { traces });
      // The console log lands in the workspace about as late as the spans (build 120 read it straight after the suite and found no injected fault and no
      // id, with every one there minutes later, register 236), so its two queries run here too, after the wait.
      for (const name of [
        'spansPerApp',
        'failedSpansPerApp',
        'chaosTraces',
        'chaosInjected',
        'correlationIdsInConsoleLog',
      ]) {
        const rows = ask(name, rest[name]);
        if (rows) out.logs[name] = rows;
      }
    }
  }
  if (ids.length > 0) {
    const found = new Set((out.logs.correlationIdsInConsoleLog ?? []).map((r) => r.id));
    out.correlation = { asked: ids.length, foundInConsoleLog: found.size };
    if (traces) out.correlation.foundInTraces = new Set((out.logs.smokeTraces ?? []).map((r) => r.id)).size;
    // A stack with tracing on whose smoke left no span at all has a broken exporter chain, not a slow one (build 120, register 237): say so plainly.
    if (traces && out.correlation.foundInTraces === 0) out.noSpans = true;
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const get = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const [resourceGroup, workspace, deployment, outPath] = [
    '--resource-group',
    '--workspace',
    '--deployment',
    '--out',
  ].map(get);
  const since = get('--since');
  if (
    !resourceGroup ||
    !workspace ||
    !outPath ||
    !deployment === !since ||
    (since && Number.isNaN(Date.parse(since)))
  ) {
    console.error(
      'usage: dev-observe.mjs --resource-group <rg> --workspace <name> (--deployment <dev-deployment.json> | --since <ISO time>) [--correlation <file>] [--traces] --out <observe.json>',
    );
    process.exit(2);
  }
  const end = new Date().toISOString();
  // With --deployment: from five minutes before the deployment (its record's time) to now; without a time in it, the last two hours. With --since (a
  // run from the lead's machine, register 228): from that time to now.
  const record = deployment ? JSON.parse(readFileSync(deployment, 'utf8')) : {};
  const start = since
    ? new Date(Date.parse(since)).toISOString()
    : new Date(
        (record.deployedAt ? Date.parse(record.deployedAt) : Date.now() - 2 * 3600_000) - 5 * 60_000,
      ).toISOString();
  const correlation = get('--correlation');
  const ids = correlation && existsSync(correlation) ? correlationIds(readFileSync(correlation, 'utf8')) : [];
  // The pipeline runs this on Linux, where az is called directly. On Windows (the lead's --since run) az is a .cmd that needs a shell, so each argument
  // is quoted for cmd, as identity-check.mjs does, and a query body goes in a file (--body @file): a query's own double quotes do not survive cmd.
  const scratch = process.platform === 'win32' ? mkdtempSync(path.join(tmpdir(), 'dev-observe-')) : null;
  let bodies = 0;
  const az = (args) => {
    if (!scratch) return execFileSync('az', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const at = args.indexOf('--body');
    const final = [...args];
    if (at >= 0) {
      const bodyFile = path.join(scratch, `body-${++bodies}.json`);
      writeFileSync(bodyFile, args[at + 1]);
      final[at + 1] = `@${bodyFile}`;
    }
    return execFileSync(`az.cmd ${final.map((a) => `"${a.replaceAll('"', '""')}"`).join(' ')}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
  };
  // Traces are read when the stack has tracing: the deploy's record names its collector (null without one), or the lead's run says --traces.
  const traces = argv.includes('--traces') || (record.collector !== undefined && record.collector !== null);
  const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  let result;
  try {
    result = observe({ resourceGroup, workspace, start, end, ids, traces }, az, sleep);
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`dev observe: ${start} to ${end}`);
  for (const [app, metrics] of Object.entries(result.metrics))
    console.log(
      `  ${app.padEnd(12)} ${Object.entries(metrics)
        .map(([k, v]) => `${k}=${v.value ?? '-'}`)
        .join('  ')}`,
    );
  for (const [name, rows] of Object.entries(result.logs)) console.log(`  log ${name}: ${rows.length} row(s)`);
  for (const r of result.logs.coldStarts ?? [])
    console.log(
      `  replica start  ${String(r.app).padEnd(12)} assigned ${String(r.assigned).slice(11, 19)}  started after ${r.seconds} s`,
    );
  for (const r of result.logs.chaosScenariosOn ?? [])
    console.log(`  chaos on       ${String(r.app).padEnd(12)} ${r.scenario} (${r.starts} start(s))`);
  for (const r of result.logs.chaosInjected ?? [])
    console.log(`  chaos injected ${String(r.app).padEnd(12)} ${r.layer}:${r.fault} x${r.faults}`);
  for (const r of result.logs.spansPerApp ?? [])
    console.log(`  spans          ${String(r.app).padEnd(12)} ${r.kind}: ${r.spans} (${r.failed} failed)`);
  for (const r of result.logs.chaosTraces ?? [])
    console.log(
      `  chaos trace    ${r.layer}:${r.fault} ${r.id} ${r.spans} span(s) in ${JSON.stringify(r.apps)}, ${r.failed} failed, longest ${r.longestMs} ms`,
    );
  if (result.correlation) {
    console.log(
      `  correlation ids: ${result.correlation.foundInConsoleLog} of ${result.correlation.asked} found in the console log`,
    );
    if (result.correlation.foundInTraces !== undefined)
      console.log(
        `  correlation ids: ${result.correlation.foundInTraces} of ${result.correlation.asked} found in Application Insights (${result.traceAttempts} read(s))`,
      );
  }
  if (result.noSpans)
    console.log(
      `  NO SPANS: tracing is on and none of the ${result.correlation.asked} smoke trace ids has a span in Application Insights after ${result.traceAttempts} read(s); the apps are not reaching the collector, or it is not exporting (register 237)`,
    );
  for (const f of result.failures) console.log(`  NOT READ: ${f.what}: ${f.error}`);
  const anything = Object.keys(result.metrics).length > 0 || Object.keys(result.logs).length > 0;
  process.exitCode = anything && !result.noSpans ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
