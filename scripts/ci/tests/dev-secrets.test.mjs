import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SECRETS,
  WRITTEN_BY,
  needsValue,
  newSecret,
  primaryConnectionString,
  setArgs,
  setSecrets,
} from '../dev-secrets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const placeholder = (created = '2026-11-20T10:00:00+00:00') => ({
  attributes: { enabled: true, created },
  tags: { ManagedBy: 'Terraform' },
});
const written = (created = '2026-11-20T11:00:00+00:00') => ({
  attributes: { enabled: true, created },
  tags: { [WRITTEN_BY.key]: WRITTEN_BY.value },
});
const connectionString = 'AccountEndpoint=https://example.documents.azure.com:443/;AccountKey=a2V5;';
const appInsights =
  'InstrumentationKey=00000000-0000-0000-0000-000000000001;IngestionEndpoint=https://eastus-0.in.applicationinsights.azure.com/';
const cosmosKeys = {
  connectionStrings: [
    { connectionString, description: 'Primary SQL Connection String', keyKind: 'Primary', type: 'SQL' },
    {
      connectionString: 'AccountEndpoint=https://x/;AccountKey=c2Vj;',
      description: 'Secondary SQL Connection String',
      keyKind: 'Secondary',
      type: 'SQL',
    },
    {
      connectionString: 'AccountEndpoint=https://x/;AccountKey=cm8=;',
      description: 'Primary Read-Only SQL Connection String',
      keyKind: 'PrimaryReadonly',
      type: 'SQL',
    },
  ],
};

describe('the secret list agrees with the dev stack', () => {
  test('the same secrets Terraform creates with a placeholder: three always, and the tracing one only with tracing', () => {
    const stack = readFileSync(path.join(root, 'infra/modules/environment/main.tf'), 'utf8');
    const block = /placeholder_secrets\s*=\s*toset\(concat\(([\s\S]*?)\n {2}\)\)/.exec(stack)[1];
    const names = (text) => (text.match(/"[^"]+"/g) ?? []).map((n) => n.slice(1, -1));
    const [always, withTracing] = block.split('var.tracing ?');
    assert.deepEqual(
      SECRETS.filter((x) => !x.optional)
        .map((x) => x.name)
        .sort(),
      names(always).sort(),
    );
    assert.deepEqual(
      SECRETS.filter((x) => x.optional).map((x) => x.name),
      names(withTracing),
    );
  });
});

describe('which secrets need their value', () => {
  test('the placeholder alone, or a newer placeholder over a written value (a recovered vault), needs it', () => {
    assert.equal(needsValue([placeholder()]), true);
    assert.equal(needsValue([written('2026-11-20T09:00:00+00:00'), placeholder('2026-11-20T10:00:00+00:00')]), true);
  });

  test('a newest version written by this step is left alone; a disabled newer version does not count', () => {
    assert.equal(needsValue([placeholder(), written()]), false);
    assert.equal(
      needsValue([
        written('2026-11-20T11:00:00+00:00'),
        {
          ...placeholder('2026-11-20T12:00:00+00:00'),
          attributes: { enabled: false, created: '2026-11-20T12:00:00+00:00' },
        },
      ]),
      false,
    );
  });

  test('a secret with no enabled version is an error (the apply has not run)', () => {
    assert.throws(() => needsValue([]), /no enabled version/);
    assert.throws(() => needsValue(undefined), /no enabled version/);
  });
});

describe('values', () => {
  test('a random secret is 32 bytes of base64url, different each time', () => {
    const a = newSecret();
    assert.match(a, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(a, 'base64url').length, 32);
    assert.notEqual(a, newSecret());
  });

  test('the primary SQL connection string is the one taken; none or a bad one is refused', () => {
    assert.equal(primaryConnectionString(cosmosKeys), connectionString);
    assert.throws(
      () => primaryConnectionString({ connectionStrings: cosmosKeys.connectionStrings.slice(1) }),
      /found 0/,
    );
    assert.throws(
      () =>
        primaryConnectionString({ connectionStrings: [{ ...cosmosKeys.connectionStrings[0], connectionString: 'x' }] }),
      /found 1/,
    );
    assert.throws(() => primaryConnectionString(undefined), /found 0/);
  });

  test('the write takes the value only from a file, and switches the output off', () => {
    const args = setArgs('kv', 'name', '/tmp/kv-1/value');
    assert.deepEqual(args.slice(args.indexOf('--file'), args.indexOf('--file') + 2), ['--file', '/tmp/kv-1/value']);
    assert.deepEqual(args.slice(-2), ['--output', 'none']);
    assert.ok(!args.includes('--value'));
    assert.ok(args.includes(`${WRITTEN_BY.key}=${WRITTEN_BY.value}`));
  });
});

describe('the step, with a fake Azure CLI', () => {
  /** A fake az: answers the list and keys calls, and for a write records the file's contents and mode as they were at that moment. */
  function fakeAz(versionsByName) {
    const calls = [];
    const writes = [];
    const az = (args) => {
      calls.push(args);
      if (args[0] === 'keyvault' && args[2] === 'list-versions')
        return JSON.stringify(versionsByName[args[args.indexOf('--name') + 1]]);
      if (args[0] === 'keyvault' && args[2] === 'list')
        return JSON.stringify(Object.keys(versionsByName).filter((n) => args.join(' ').includes(`'${n}'`)));
      if (args[0] === 'cosmosdb') return JSON.stringify(cosmosKeys);
      if (args[0] === 'resource' && args[1] === 'list')
        return JSON.stringify(['/subscriptions/s/resourceGroups/rg-x/providers/Microsoft.Insights/components/appi-x']);
      if (args[0] === 'resource' && args[1] === 'show') return JSON.stringify({ ConnectionString: appInsights });
      if (args[0] === 'keyvault' && args[2] === 'set') {
        const file = args[args.indexOf('--file') + 1];
        writes.push({
          name: args[args.indexOf('--name') + 1],
          value: readFileSync(file, 'utf8'),
          mode: statSync(file).mode & 0o777,
        });
        return '';
      }
      throw new Error(`unexpected az call: ${args.join(' ')}`);
    };
    return { az, calls, writes };
  }
  const withTemp = (fn) => {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'dev-secrets-test-'));
    try {
      return fn(temp);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  };
  const options = (temp) => ({ vault: 'kv-x', cosmosAccount: 'cosmos-x', resourceGroup: 'rg-x', temp });

  test('first run: all three are set from files that are gone afterwards, and no value is on any command line or in the log unmasked', () => {
    withTemp((temp) => {
      const { az, calls, writes } = fakeAz(Object.fromEntries(SECRETS.map((s) => [s.name, [placeholder()]])));
      const log = [];
      const results = setSecrets(options(temp), az, (l) => log.push(l));
      assert.deepEqual(
        results.map((r) => r.action),
        ['set', 'set', 'set', 'set'],
      );
      assert.deepEqual(
        writes.map((w) => w.name),
        SECRETS.map((s) => s.name),
      );
      assert.equal(writes[0].value, connectionString);
      for (const w of writes.slice(1, 3)) assert.match(w.value, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(writes[3].name, 'appinsights-connection-string');
      assert.equal(writes[3].value, appInsights);
      if (process.platform !== 'win32') for (const w of writes) assert.equal(w.mode, 0o600, w.name);
      assert.deepEqual(readdirSync(temp), [], 'the private folders are deleted');
      for (const w of writes) {
        for (const args of calls)
          assert.ok(!args.some((a) => a.includes(w.value)), `${w.name}'s value is on a command line`);
        const lines = log.filter((l) => l.includes(w.value));
        assert.deepEqual(
          lines,
          [`##vso[task.setsecret]${w.value}`],
          `${w.name}: only the masking line holds the value`,
        );
      }
    });
  });

  test('a second run changes nothing; a recovered placeholder is set again', () => {
    withTemp((temp) => {
      const versions = Object.fromEntries(SECRETS.map((s) => [s.name, [placeholder(), written()]]));
      versions['session-encryption-key'] = [
        written('2026-11-20T09:00:00+00:00'),
        placeholder('2026-11-20T10:00:00+00:00'),
      ];
      const { az, writes } = fakeAz(versions);
      const results = setSecrets(options(temp), az, () => {});
      assert.deepEqual(results, [
        { name: 'cosmos-connection-string', action: 'kept' },
        { name: 'ordering-client-secret', action: 'kept' },
        { name: 'session-encryption-key', action: 'set' },
        { name: 'appinsights-connection-string', action: 'kept' },
      ]);
      assert.deepEqual(
        writes.map((w) => w.name),
        ['session-encryption-key'],
      );
    });
  });

  test('a stack without tracing has no Application Insights secret: it is left out, and no Application Insights call is made', () => {
    withTemp((temp) => {
      const required = SECRETS.filter((s) => !s.optional);
      const { az, calls, writes } = fakeAz(Object.fromEntries(required.map((s) => [s.name, [placeholder()]])));
      const results = setSecrets(options(temp), az, () => {});
      assert.deepEqual(
        results.map((r) => `${r.name}:${r.action}`),
        [...required.map((s) => `${s.name}:set`), 'appinsights-connection-string:absent'],
      );
      assert.equal(writes.length, 3);
      assert.ok(!calls.some((c) => c[0] === 'resource'));
    });
  });

  test('more than one Application Insights resource in the group is refused', () => {
    withTemp((temp) => {
      const base = fakeAz(Object.fromEntries(SECRETS.map((s) => [s.name, [placeholder()]])));
      const az = (args) => (args[0] === 'resource' && args[1] === 'list' ? JSON.stringify(['a', 'b']) : base.az(args));
      assert.throws(
        () => setSecrets(options(temp), az, () => {}),
        /expected one Application Insights resource, found 2/,
      );
      assert.deepEqual(readdirSync(temp), []);
    });
  });

  test('a failed write still deletes the file', () => {
    withTemp((temp) => {
      const az = (args) => {
        if (args[2] === 'list-versions') return JSON.stringify([placeholder()]);
        if (args[0] === 'keyvault' && args[2] === 'list') return JSON.stringify(['appinsights-connection-string']);
        if (args[0] === 'cosmosdb') return JSON.stringify(cosmosKeys);
        throw new Error('Forbidden');
      };
      assert.throws(() => setSecrets(options(temp), az, () => {}), /Forbidden/);
      assert.deepEqual(readdirSync(temp), []);
    });
  });
});
