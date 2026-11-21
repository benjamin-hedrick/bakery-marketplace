import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMAGES, buildArgs, checkRegistry, checkTag, pickDigest, verifyLoaded } from '../dev-images.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const digest = (c) => `sha256:${c.repeat(64)}`;

describe('the image list agrees with the dev stack and the Compose apps profile', () => {
  const stack = read('infra/modules/environment/main.tf');
  const compose = read('docker-compose.yml');

  test('every container app that starts on the placeholder image has exactly one image, and no other image is built', () => {
    // The apps under local.apps (name = "...") and the mock issuer; the Redis apps run a public image and are not built here.
    const appsBlock = stack.slice(stack.indexOf('  apps = {'), stack.indexOf('# ---- Budget alert'));
    const names = [...appsBlock.matchAll(/^\s+name\s+= "([a-z-]+)"$/gm)].map((m) => m[1]);
    assert.ok(/name\s+= "mock-oidc"/.test(stack), 'the mock issuer app');
    names.push('mock-oidc');
    assert.deepEqual(
      IMAGES.filter((i) => i.kind === 'app')
        .map((i) => i.app)
        .sort(),
      names.sort(),
    );
    // The container app jobs (resource "azurerm_container_app_job" "<key>" with name = "<name>").
    const jobs = [...stack.matchAll(/resource "azurerm_container_app_job" "\w+" \{\n\s+name\s+= "([a-z-]+)"/g)].map(
      (m) => m[1],
    );
    assert.deepEqual(
      IMAGES.filter((i) => i.kind === 'job')
        .map((i) => i.app)
        .sort(),
      jobs.sort(),
    );
    assert.ok(IMAGES.every((i) => i.kind === 'app' || i.kind === 'job'));
    assert.equal(
      stack.split('image  = var.image_placeholder').length - 1,
      3,
      'the apps resource, the mock issuer and the seed job',
    );
  });

  test('each Dockerfile exists and each repository name is unique', () => {
    for (const image of IMAGES) assert.ok(existsSync(path.join(root, image.dockerfile)), image.dockerfile);
    assert.equal(new Set(IMAGES.map((i) => i.repository)).size, IMAGES.length);
  });

  test('the .NET build arguments are the ones the Compose apps profile uses', () => {
    for (const image of IMAGES.filter((i) => i.dockerfile === 'services/Dockerfile.dotnet')) {
      const { PROJECT, ASSEMBLY, PORT } = image.args;
      assert.match(
        compose,
        new RegExp(`args: \\{ PROJECT: ${PROJECT}, ASSEMBLY: ${ASSEMBLY}, PORT: "${PORT}" \\}`),
        image.app,
      );
      assert.match(
        stack,
        new RegExp(`name\\s+= "${image.app}"\\n\\s+port\\s+= ${PORT}\\n`),
        `${image.app} listens on ${PORT}`,
      );
    }
  });
});

describe('build arguments', () => {
  test('tag, build arguments and labels, with the repository root as the context', () => {
    assert.deepEqual(buildArgs(IMAGES[0], '123', 'abc1234'), [
      'build',
      '--file',
      'services/Dockerfile.dotnet',
      '--tag',
      'bakery-catalog:123',
      '--build-arg',
      'PROJECT=services/catalog-service/src/CatalogService.csproj',
      '--build-arg',
      'ASSEMBLY=CatalogService',
      '--build-arg',
      'PORT=5200',
      '--label',
      'org.opencontainers.image.revision=abc1234',
      '--label',
      'org.opencontainers.image.version=123',
      '.',
    ]);
  });

  test('a tag or a registry that is not well formed is refused', () => {
    assert.equal(checkTag('20251120.3'), '20251120.3');
    for (const bad of ['', '-x', '.x', 'a b', 'a:b', 'x'.repeat(129), undefined])
      assert.throws(() => checkTag(bad), String(bad));
    for (const good of ['example.azurecr.io', 'localhost:5000', 'my-registry.example.com:443'])
      assert.equal(checkRegistry(good), good);
    for (const bad of [
      'https://example.azurecr.io',
      'Example.azurecr.io',
      'example.azurecr.io/x',
      'example..io',
      '-x.io',
      'x.io:',
      undefined,
    ])
      assert.throws(() => checkRegistry(bad), String(bad));
  });
});

describe('the pushed digest', () => {
  const registry = 'example.azurecr.io';

  test('is the one entry for this registry and repository', () => {
    const repoDigests = [
      `other.io/bakery-web@${digest('a')}`,
      `${registry}/bakery-web@${digest('b')}`,
      `${registry}/bakery-bff@${digest('c')}`,
    ];
    assert.equal(pickDigest(repoDigests, registry, 'bakery-web'), `${registry}/bakery-web@${digest('b')}`);
  });

  test('none, two, or a malformed digest is refused', () => {
    assert.throws(() => pickDigest([], registry, 'bakery-web'), /found 0/);
    assert.throws(() => pickDigest(undefined, registry, 'bakery-web'), /found 0/);
    assert.throws(
      () =>
        pickDigest(
          [`${registry}/bakery-web@${digest('a')}`, `${registry}/bakery-web@${digest('b')}`],
          registry,
          'bakery-web',
        ),
      /found 2/,
    );
    assert.throws(() => pickDigest([`${registry}/bakery-web@sha256:abc`], registry, 'bakery-web'), /found 0/);
    // A repository whose name starts with another's is not taken for it.
    assert.throws(() => pickDigest([`${registry}/bakery-web-old@${digest('a')}`], registry, 'bakery-web'), /found 0/);
  });
});

describe('the loaded images are the built ones', () => {
  const manifest = {
    tag: '7',
    images: IMAGES.map((i, n) => ({ app: i.app, repository: i.repository, id: digest(String(n)) })),
  };
  const loaded = new Map(manifest.images.map((i) => [`${i.repository}:7`, i.id]));

  test('accepted when every image is there with the recorded id', () => {
    assert.deepEqual(
      verifyLoaded(manifest, (ref) => loaded.get(ref)),
      [],
    );
  });

  test('refused when an image is missing, has another id, or the list is not the expected one', () => {
    const missing = new Map(loaded);
    missing.delete('bakery-web:7');
    assert.match(
      verifyLoaded(manifest, (ref) => missing.get(ref)).join('\n'),
      /bakery-web:7 is not in the loaded images/,
    );

    const changed = new Map(loaded).set('bakery-bff:7', digest('f'));
    assert.match(
      verifyLoaded(manifest, (ref) => changed.get(ref)).join('\n'),
      /bakery-bff:7 has id sha256:f+, but the build recorded/,
    );

    const short = { ...manifest, images: manifest.images.slice(1) };
    assert.match(verifyLoaded(short, (ref) => loaded.get(ref)).join('\n'), /the artifact holds/);

    const renamed = {
      ...manifest,
      images: manifest.images.map((i) => (i.app === 'web' ? { ...i, repository: 'web' } : i)),
    };
    assert.match(verifyLoaded(renamed, () => digest('0')).join('\n'), /web: repository web, expected bakery-web/);
  });
});
