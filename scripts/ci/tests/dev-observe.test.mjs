import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { APPS, METRICS, correlationIds, metricValue, observe, queries, rowsOf } from '../dev-observe.mjs';

const id = (c) => c.repeat(32);
const START = '2026-11-20T10:00:00.000Z';
const END = '2026-11-20T11:00:00.000Z';

describe('the pieces', () => {
  test('the queries cover the window, and only well-formed ids enter the query text', () => {
    const q = queries(START, END, [id('a'), "x') | take 1 //", id('b')]);
    for (const text of Object.values(q))
      assert.match(
        text,
        /between \(datetime\('2026-11-20T10:00:00\.000Z'\) \.\. datetime\('2026-11-20T11:00:00\.000Z'\)\)/,
      );
    assert.match(q.correlationIdsInConsoleLog, new RegExp(`in \\('${id('a')}', '${id('b')}'\\)`));
    assert.doesNotMatch(q.correlationIdsInConsoleLog, /take 1/);
    assert.equal(queries(START, END, []).correlationIdsInConsoleLog, undefined);
    // Only counts and names are asked for, never a line's text; the replica starts are names and times only.
    for (const [name, text] of Object.entries(q)) if (name !== 'coldStarts') assert.match(text, /summarize/);
    assert.match(
      q.coldStarts,
      /\| project app, assigned = prevT, containerStarted = t, seconds = [^|]*\| order by assigned asc$/,
    );
    assert.doesNotMatch(q.coldStarts, /Log_s/);
  });

  test('the chaos queries keep counts by app, scenario, layer and fault, never the key or trace id, and read both journals', () => {
    const q = queries(START, END);
    assert.match(q.chaosScenariosOn, /\| summarize starts = count\(\) by app = ContainerAppName_s, scenario$/);
    assert.match(q.chaosInjected, /\| summarize faults = count\(\) by app = ContainerAppName_s, layer, fault$/);
    for (const text of [q.chaosScenariosOn, q.chaosInjected]) assert.doesNotMatch(text, /\bkey\b|trace/i);
    // The patterns inside the queries (simple enough to mean the same in RE2 and JavaScript), against a line of each journal.
    const patterns = (text) => [...text.matchAll(/extract\((['"])(.+?)\1, 1, Log_s\)/g)].map((m) => new RegExp(m[2]));
    const first = (text, line) =>
      patterns(text)
        .map((p) => p.exec(line)?.[1])
        .filter(Boolean);
    const dotnet = '      chaos injected: layer=payment fault=lost-response key=order-1 trace=abc';
    const node =
      '{"level":"warn","msg":"chaos injected","layer":"bff-door","fault":"reject","key":"seq:3","traceId":"abc"}';
    assert.deepEqual(first(q.chaosInjected, dotnet), ['payment', 'lost-response']);
    assert.deepEqual(first(q.chaosInjected, node), ['bff-door', 'reject']);
    assert.deepEqual(
      first(q.chaosScenariosOn, "warn: x[0] CHAOS SCENARIO 'checkout-trouble' IS ON (seed 7, layers payment)."),
      ['checkout-trouble'],
    );
  });

  test('rows of a query answer, by column name', () => {
    const answer = {
      tables: [
        {
          columns: [{ name: 'app' }, { name: 'lines' }],
          rows: [
            ['web', 12],
            ['catalog', 3],
          ],
        },
      ],
    };
    assert.deepEqual(rowsOf(answer), [
      { app: 'web', lines: 12 },
      { app: 'catalog', lines: 3 },
    ]);
    assert.deepEqual(rowsOf({}), []);
  });

  test('a metric is summed for Total and the largest point otherwise; no points is null, not zero', () => {
    const answer = { value: [{ timeseries: [{ data: [{ total: 2, maximum: 1 }, { total: 5, maximum: 3 }, {}] }] }] };
    assert.equal(metricValue(answer, 'Total'), 7);
    assert.equal(metricValue(answer, 'Maximum'), 3);
    assert.equal(metricValue({ value: [] }, 'Total'), null);
  });

  test('correlation ids: distinct, well formed, newest first, limited', () => {
    const lines =
      [id('a'), id('b'), id('a'), 'nope', id('c')].map((c) => JSON.stringify({ correlationId: c })).join('\n') +
      '\nnot json';
    assert.deepEqual(correlationIds(lines), [id('c'), id('b'), id('a')]);
    assert.deepEqual(correlationIds(lines, 2), [id('c'), id('b')]);
  });
});

describe('observe, with a fake Azure CLI', () => {
  test('every app and metric is read, the log is queried through az rest, and the correlation ids found are counted', () => {
    const calls = [];
    const az = (args) => {
      calls.push(args);
      if (args[0] === 'containerapp')
        return `/subscriptions/s/resourceGroups/rg/providers/Microsoft.App/containerApps/${args[3]}\n`;
      if (args[0] === 'monitor' && args[1] === 'metrics')
        return JSON.stringify({ value: [{ timeseries: [{ data: [{ total: 4, maximum: 1 }] }] }] });
      if (args[0] === 'monitor' && args[1] === 'log-analytics') return 'workspace-guid\n';
      if (args[0] === 'rest') {
        const { query } = JSON.parse(args[args.indexOf('--body') + 1]);
        if (query.includes('extract'))
          return JSON.stringify({
            tables: [
              { columns: [{ name: 'id' }, { name: 'app' }, { name: 'lines' }], rows: [[id('a'), 'catalog', 2]] },
            ],
          });
        return JSON.stringify({ tables: [{ columns: [{ name: 'app' }, { name: 'lines' }], rows: [['web', 9]] }] });
      }
      throw new Error(args.join(' '));
    };
    const out = observe(
      { resourceGroup: 'rg', workspace: 'log-bakery-dev', start: START, end: END, ids: [id('a'), id('b')] },
      az,
    );
    assert.deepEqual(Object.keys(out.metrics), APPS);
    assert.equal(calls.filter((c) => c[1] === 'metrics').length, APPS.length * METRICS.length);
    assert.equal(out.metrics.web.Requests.value, 4);
    const rest = calls.filter((c) => c[0] === 'rest');
    assert.equal(rest.length, 7); // console lines, error-like lines, system events, replica starts, chaos on, chaos injected, correlation ids
    assert.ok(rest.every((c) => c.includes('https://api.loganalytics.io/v1/workspaces/workspace-guid/query')));
    assert.deepEqual(out.correlation, { asked: 2, foundInConsoleLog: 1 });
    assert.deepEqual(out.failures, []);
  });

  test('a failed metric or query is recorded and the rest still run', () => {
    const az = (args) => {
      if (args[0] === 'containerapp') return 'id\n';
      if (args[1] === 'metrics' && args.includes('RestartCount'))
        throw new Error('Metric RestartCount not found\nmore');
      if (args[1] === 'metrics') return JSON.stringify({ value: [] });
      if (args[1] === 'log-analytics') throw new Error('AuthorizationFailed');
      throw new Error('unexpected');
    };
    const out = observe({ resourceGroup: 'rg', workspace: 'w', start: START, end: END, ids: [] }, az);
    assert.equal(out.failures.filter((f) => /RestartCount/.test(f.what)).length, APPS.length);
    assert.ok(out.failures.some((f) => f.what === 'log workspace id' && f.error === 'AuthorizationFailed'));
    assert.equal(out.metrics.web.Requests.value, null);
    assert.deepEqual(out.logs, {});
  });
});
