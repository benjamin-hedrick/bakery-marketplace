import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMAGES } from '../dev-images.mjs';
import {
  JOBS,
  ORDER,
  PLACEHOLDER,
  buildOf,
  checkSuffix,
  classify,
  deploy,
  refusals,
  updateArgs,
} from '../dev-deploy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const registry = 'example.azurecr.io';
const digest = (c) => `sha256:${c.repeat(64)}`;
const repoOf = (app) => IMAGES.find((i) => i.app === app).repository;
const ALL = [...JOBS, ...ORDER];
const record = (tag = '120') => ({
  tag,
  revision: 'abc1234',
  registry,
  images: ALL.map((app, n) => ({ app, image: `${registry}/${repoOf(app)}@${digest(String(n + 1))}` })),
});

describe('agreement with the dev stack', () => {
  test('the placeholder is the dev stack default; every built app is deployed and every built job run', () => {
    const variables = readFileSync(path.join(root, 'infra/modules/environment/variables.tf'), 'utf8');
    assert.match(
      variables,
      new RegExp(`variable "image_placeholder" \\{[\\s\\S]*?default\\s+= "${PLACEHOLDER.replace(/[.]/g, '\\.')}"`),
    );
    const names = (kind) =>
      IMAGES.filter((i) => i.kind === kind)
        .map((i) => i.app)
        .sort();
    assert.deepEqual([...ORDER].sort(), names('app'));
    assert.deepEqual([...JOBS].sort(), names('job'));
  });
});

describe('the pieces', () => {
  test('classify: the placeholder, an image of this registry by digest, anything else', () => {
    assert.deepEqual(classify(PLACEHOLDER, registry), { kind: 'placeholder' });
    assert.deepEqual(classify(`${registry}/bakery-web@${digest('a')}`, registry), {
      kind: 'ours',
      repository: 'bakery-web',
      digest: digest('a'),
    });
    for (const other of [
      `${registry}/bakery-web:120`,
      `other.io/bakery-web@${digest('a')}`,
      `exampleXazurecr.io/bakery-web@${digest('a')}`,
      '',
      undefined,
    ])
      assert.deepEqual(classify(other, registry), { kind: 'unknown' }, String(other));
  });

  test('buildOf: the largest all-digit tag', () => {
    assert.equal(buildOf(['118', '120', 'latest']), 120);
    assert.equal(buildOf(['local1']), undefined);
    assert.equal(buildOf(undefined), undefined);
  });

  test('a revision suffix is short, lower case, starts with a letter', () => {
    assert.equal(checkSuffix('b120-1'), 'b120-1');
    for (const bad of ['120', 'B120', 'b120-', 'b_1', 'b'.repeat(21), undefined])
      assert.throws(() => checkSuffix(bad), String(bad));
  });

  test('the update names the digest and a new revision, and switches the output off', () => {
    assert.deepEqual(updateArgs('web', 'rg', `${registry}/bakery-web@${digest('a')}`, 'b120-1'), [
      'containerapp',
      'update',
      '--name',
      'web',
      '--resource-group',
      'rg',
      '--image',
      `${registry}/bakery-web@${digest('a')}`,
      '--revision-suffix',
      'b120-1',
      '--output',
      'none',
    ]);
  });
});

describe('refusals (register 110)', () => {
  const current = (build, image) =>
    Object.fromEntries(
      ALL.map((app, n) => [app, { image: image ?? `${registry}/${repoOf(app)}@${digest('abcdef'[n])}`, build }]),
    );

  test('first deploy (placeholders), the same build again and a newer build go on', () => {
    assert.deepEqual(refusals(record(), current(undefined, PLACEHOLDER)), []);
    assert.deepEqual(refusals(record(), current(120)), []);
    assert.deepEqual(refusals(record(), current(119)), []);
  });

  test('an older build, an image without a build tag, a foreign image or a wrong repository is refused, for a job as for an app', () => {
    assert.match(refusals(record('120'), current(121)).join('\n'), /runs build 121, newer than this build 120/);
    assert.match(refusals(record(), current(undefined)).join('\n'), /has no build tag in the registry/);
    assert.match(
      refusals(record(), current(undefined, 'docker.io/library/nginx:latest')).join('\n'),
      /neither the placeholder nor an image of this registry/,
    );
    const swapped = current(100);
    swapped.web = { image: `${registry}/bakery-bff@${digest('9')}`, build: 100 };
    assert.match(refusals(record(), swapped).join('\n'), /web runs an image of bakery-bff, expected bakery-web/);
    const newerSeed = current(100);
    newerSeed.seed = { image: `${registry}/bakery-seed@${digest('9')}`, build: 130 };
    assert.match(refusals(record('120'), newerSeed).join('\n'), /seed runs build 130/);
  });

  test('a record that is not a full build is refused', () => {
    assert.match(refusals(record('local1'), {}).join('\n'), /not a build id/);
    assert.match(refusals({ ...record(), images: record().images.slice(1) }, {}).join('\n'), /the record holds/);
  });
});

describe('the deploy, with a fake Azure CLI', () => {
  function fake({ images, tags = {}, states = {}, seed = ['Running', 'Succeeded'] }) {
    const calls = [];
    const az = (args) => {
      calls.push(args);
      const name = args[args.indexOf('--name') + 1];
      if (args[0] === 'containerapp' && args[1] === 'job') {
        if (args[2] === 'show') return `${images[name]}\n`;
        if (args[2] === 'update') return '';
        if (args[2] === 'start') return 'seed-abc123\n';
        if (args[2] === 'execution') return `${seed.length > 1 ? seed.shift() : seed[0]}\n`;
      }
      if (args[0] === 'containerapp' && args[1] === 'show' && args.includes('properties.configuration.ingress.fqdn'))
        return `${name}.test-env.eastus.azurecontainerapps.io\n`;
      if (args[0] === 'containerapp' && args[1] === 'show') return `${images[name]}\n`;
      if (args[0] === 'acr')
        return JSON.stringify({ digest: name.split('@')[1], tags: tags[name.split('@')[0]] ?? [] });
      if (args[0] === 'containerapp' && args[1] === 'update') return '';
      if (args[0] === 'containerapp' && args[1] === 'revision') {
        const queue = states[name] ?? ['Provisioned'];
        return `${queue.length > 1 ? queue.shift() : queue[0]}\n`;
      }
      throw new Error(`unexpected az call: ${args.join(' ')}`);
    };
    let t = 0;
    const clock = { now: () => t, wait: (ms) => (t += ms) };
    return { az, calls, clock };
  }
  const placeholders = Object.fromEntries(ALL.map((app) => [app, PLACEHOLDER]));
  const run = (f, opts = {}) =>
    deploy({ record: record(), resourceGroup: 'rg', suffix: 'b120-1', ...opts }, f.az, f.clock, () => {});
  const appUpdates = (calls) =>
    calls.filter((c) => c[0] === 'containerapp' && c[1] === 'update').map((c) => c[c.indexOf('--name') + 1]);

  test('first deploy: the seed runs to success first, then every app is updated in order and waited for, and the record written', () => {
    const f = fake({ images: placeholders, states: { catalog: ['Provisioning', 'Provisioning', 'Provisioned'] } });
    const result = run(f);
    const seedStart = f.calls.findIndex((c) => c[1] === 'job' && c[2] === 'start');
    const seedDone = f.calls.findLastIndex((c) => c[1] === 'job' && c[2] === 'execution');
    const firstApp = f.calls.findIndex((c) => c[0] === 'containerapp' && c[1] === 'update');
    assert.ok(seedStart > 0 && seedDone > seedStart && firstApp > seedDone, 'the seed, then the apps');
    const jobUpdate = f.calls.find((c) => c[1] === 'job' && c[2] === 'update');
    assert.equal(jobUpdate[jobUpdate.indexOf('--image') + 1], record().images.find((i) => i.app === 'seed').image);
    assert.deepEqual(appUpdates(f.calls), ORDER);
    assert.equal(f.calls.filter((c) => c[1] === 'revision' && c.includes('catalog')).length, 3);
    assert.ok(!f.calls.some((c) => c[0] === 'acr'), 'no registry lookup for a placeholder');
    assert.deepEqual(result.urls, {
      web: 'https://web.test-env.eastus.azurecontainerapps.io',
      'mock-oidc': 'https://mock-oidc.test-env.eastus.azurecontainerapps.io',
    });
    assert.deepEqual(result.jobs, [
      {
        job: 'seed',
        before: PLACEHOLDER,
        beforeBuild: null,
        image: record().images.find((i) => i.app === 'seed').image,
        execution: 'seed-abc123',
      },
    ]);
    assert.deepEqual(
      result.deployed.map((d) => [d.app, d.revision, d.before]),
      ORDER.map((app) => [app, `${app}--b120-1`, PLACEHOLDER]),
    );
  });

  test('with the seed input off (WI-DEP-002 step 3) the seed job is neither updated nor run, and every app is still deployed', () => {
    const f = fake({ images: placeholders });
    const result = run(f, { seed: false });
    assert.ok(
      !f.calls.some((c) => c[1] === 'job' && c[2] !== 'show'),
      'the job is only read (its build still counts for the refusal)',
    );
    assert.deepEqual(appUpdates(f.calls), ORDER);
    assert.deepEqual(result.jobs, []);
    assert.equal(result.seeded, false);
    assert.equal(run(fake({ images: placeholders })).seeded, true, 'on by default, as dev always ran it');
  });

  test('an older build is refused before anything is updated or run', () => {
    const images = Object.fromEntries(ALL.map((app) => [app, `${registry}/${repoOf(app)}@${digest('f')}`]));
    const tags = Object.fromEntries(ALL.map((app) => [repoOf(app), ['121']]));
    const f = fake({ images, tags });
    assert.throws(
      () => run({ ...f }, { record: record('120') }),
      (e) => /REFUSED/.test(e.message) && e.problems.length === ALL.length,
    );
    assert.ok(!f.calls.some((c) => c.includes('update') || c.includes('start')));
  });

  test('a seed that fails, or never finishes, stops the deploy before any app changes', () => {
    for (const end of ['Failed', 'Degraded', 'Stopped']) {
      const f = fake({ images: placeholders, seed: ['Running', end] });
      assert.throws(() => run(f), new RegExp(`seed: execution seed-abc123 ended ${end}`));
      assert.deepEqual(appUpdates(f.calls), [], end);
    }
    const stuck = fake({ images: placeholders, seed: ['Running'] });
    assert.throws(
      () => run(stuck, { timeoutMs: 30_000, pollMs: 10_000 }),
      /seed: execution seed-abc123 still Running after 30 s/,
    );
    assert.deepEqual(appUpdates(stuck.calls), []);
  });

  test('a revision that fails, or never provisions, stops the deploy', () => {
    const failed = fake({ images: placeholders, states: { 'mock-oidc': ['Failed'] } });
    assert.throws(() => run(failed), /mock-oidc: revision mock-oidc--b120-1 failed/);
    assert.equal(appUpdates(failed.calls).length, 1, 'stops at the first app');

    const stuck = fake({ images: placeholders, states: { 'mock-oidc': ['Provisioning'] } });
    assert.throws(() => run(stuck, { timeoutMs: 30_000, pollMs: 10_000 }), /still Provisioning after 30 s/);
  });
});
