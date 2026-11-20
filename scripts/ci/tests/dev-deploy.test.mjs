import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMAGES } from '../dev-images.mjs';
import { ORDER, PLACEHOLDER, buildOf, checkSuffix, classify, deploy, refusals, updateArgs } from '../dev-deploy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const registry = 'example.azurecr.io';
const digest = (c) => `sha256:${c.repeat(64)}`;
const repoOf = (app) => IMAGES.find((i) => i.app === app).repository;
const record = (tag = '120') => ({
  tag,
  revision: 'abc1234',
  registry,
  images: ORDER.map((app, n) => ({ app, image: `${registry}/${repoOf(app)}@${digest(String(n + 1))}` })),
});

describe('agreement with the dev stack', () => {
  test('the placeholder is the dev stack default, and every app with a built image is deployed', () => {
    const variables = readFileSync(path.join(root, 'infra/environments/dev/variables.tf'), 'utf8');
    assert.match(
      variables,
      new RegExp(`variable "image_placeholder" \\{[\\s\\S]*?default\\s+= "${PLACEHOLDER.replace(/[.]/g, '\\.')}"`),
    );
    assert.deepEqual([...ORDER].sort(), IMAGES.map((i) => i.app).sort());
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
      ORDER.map((app, n) => [app, { image: image ?? `${registry}/${repoOf(app)}@${digest(String(n + 5))}`, build }]),
    );

  test('first deploy (placeholders), the same build again and a newer build go on', () => {
    assert.deepEqual(refusals(record(), current(undefined, PLACEHOLDER)), []);
    assert.deepEqual(refusals(record(), current(120)), []);
    assert.deepEqual(refusals(record(), current(119)), []);
  });

  test('an older build, an image without a build tag, a foreign image or a wrong repository is refused', () => {
    assert.match(refusals(record('120'), current(121)).join('\n'), /runs build 121, newer than this build 120/);
    assert.match(refusals(record(), current(undefined)).join('\n'), /has no build tag in the registry/);
    assert.match(
      refusals(record(), current(undefined, 'docker.io/library/nginx:latest')).join('\n'),
      /neither the placeholder nor an image of this registry/,
    );
    const swapped = current(100);
    swapped.web = { image: `${registry}/bakery-bff@${digest('9')}`, build: 100 };
    assert.match(refusals(record(), swapped).join('\n'), /web runs an image of bakery-bff, expected bakery-web/);
  });

  test('a record that is not a full build is refused', () => {
    assert.match(refusals(record('local1'), {}).join('\n'), /not a build id/);
    assert.match(refusals({ ...record(), images: record().images.slice(1) }, {}).join('\n'), /the record holds/);
  });
});

describe('the deploy, with a fake Azure CLI', () => {
  function fake({ images, tags = {}, states = {} }) {
    const calls = [];
    const az = (args) => {
      calls.push(args);
      const name = args[args.indexOf('--name') + 1];
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
  const placeholders = Object.fromEntries(ORDER.map((app) => [app, PLACEHOLDER]));

  test('first deploy: every app updated in order to its digest, each revision waited for, and the record written', () => {
    const { az, calls, clock } = fake({
      images: placeholders,
      states: { catalog: ['Provisioning', 'Provisioning', 'Provisioned'] },
    });
    const result = deploy({ record: record(), resourceGroup: 'rg', suffix: 'b120-1' }, az, clock, () => {});
    const updates = calls.filter((c) => c[1] === 'update').map((c) => c[c.indexOf('--name') + 1]);
    assert.deepEqual(updates, ORDER);
    assert.equal(calls.filter((c) => c[1] === 'revision' && c.includes('catalog')).length, 3);
    assert.ok(!calls.some((c) => c[0] === 'acr'), 'no registry lookup for a placeholder');
    assert.deepEqual(
      result.deployed.map((d) => [d.app, d.revision, d.before]),
      ORDER.map((app) => [app, `${app}--b120-1`, PLACEHOLDER]),
    );
    assert.equal(
      result.deployed.find((d) => d.app === 'web').image,
      record().images.find((i) => i.app === 'web').image,
    );
  });

  test('an older build is refused before anything is updated', () => {
    const images = Object.fromEntries(ORDER.map((app) => [app, `${registry}/${repoOf(app)}@${digest('f')}`]));
    const tags = Object.fromEntries(ORDER.map((app) => [repoOf(app), ['121']]));
    const { az, calls, clock } = fake({ images, tags });
    assert.throws(
      () => deploy({ record: record('120'), resourceGroup: 'rg', suffix: 'b120-1' }, az, clock, () => {}),
      (e) => /REFUSED/.test(e.message) && e.problems.length === ORDER.length,
    );
    assert.ok(!calls.some((c) => c[1] === 'update'));
  });

  test('a revision that fails, or never provisions, stops the deploy', () => {
    const failed = fake({ images: placeholders, states: { 'mock-oidc': ['Failed'] } });
    assert.throws(
      () => deploy({ record: record(), resourceGroup: 'rg', suffix: 'b120-1' }, failed.az, failed.clock, () => {}),
      /mock-oidc: revision mock-oidc--b120-1 failed/,
    );
    assert.equal(failed.calls.filter((c) => c[1] === 'update').length, 1, 'stops at the first app');

    const stuck = fake({ images: placeholders, states: { 'mock-oidc': ['Provisioning'] } });
    assert.throws(
      () =>
        deploy(
          { record: record(), resourceGroup: 'rg', suffix: 'b120-1', timeoutMs: 30_000, pollMs: 10_000 },
          stuck.az,
          stuck.clock,
          () => {},
        ),
      /still Provisioning after 30 s/,
    );
  });
});
