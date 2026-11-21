#!/usr/bin/env node
// The dev environment's application images (ADR-0020 decision 1: build once, promote by digest; WI-DEP-001). Two halves, in two pipeline stages:
//
//   node scripts/ci/dev-images.mjs build --tag <build id> --revision <commit> --out <dir>
//       Builds the six images the dev stack runs (five apps and the seed job), one at a time (register item 103), with no credentials and no registry. Writes
//       <dir>/images.tar.gz (all six, one docker save) and <dir>/images.json (each image's app, repository and image id). The pipeline publishes
//       <dir> as an artifact, so the build has passed before anyone is asked to approve the deploy.
//   node scripts/ci/dev-images.mjs push --in <dir> --registry <login server> --out <record.json>
//       In the approved deploy job, after "az acr login": loads the artifact, refuses unless every image id is the one the build recorded, tags
//       each image <registry>/<repository>:<tag> and pushes it, then writes the record of what was pushed: each app's image by digest
//       (<registry>/<repository>@sha256:...). The deploy step updates the apps to those digests.
//
// Nothing here reads or prints a secret; an image holds none (each Dockerfile says so). Exit code 0 = done, 1 = a build, load, check or push
// failed, 2 = bad usage.
import { execFileSync } from 'node:child_process';
import { createReadStream, createWriteStream, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';

/**
 * The images the dev stack runs. `app` is the container app's (or, with `kind: 'job'`, the container app job's) name in infra/modules/environment/main.tf;
 * the build arguments match the `apps` profile in docker-compose.yml. The notification service is not deployed to dev (no event crosses a service
 * boundary there), so it has no image. The seed is a job: it runs once per deploy and exits (register 224).
 */
export const IMAGES = [
  {
    app: 'catalog',
    kind: 'app',
    repository: 'bakery-catalog',
    dockerfile: 'services/Dockerfile.dotnet',
    args: { PROJECT: 'services/catalog-service/src/CatalogService.csproj', ASSEMBLY: 'CatalogService', PORT: '5200' },
  },
  {
    app: 'ordering',
    kind: 'app',
    repository: 'bakery-ordering',
    dockerfile: 'services/Dockerfile.dotnet',
    args: {
      PROJECT: 'services/ordering-service/src/OrderingService.csproj',
      ASSEMBLY: 'OrderingService',
      PORT: '5300',
    },
  },
  {
    app: 'graphql-bff',
    kind: 'app',
    repository: 'bakery-bff',
    dockerfile: 'services/graphql-bff/Dockerfile',
    args: {},
  },
  { app: 'web', kind: 'app', repository: 'bakery-web', dockerfile: 'apps/web-customer/Dockerfile', args: {} },
  {
    app: 'mock-oidc',
    kind: 'app',
    repository: 'bakery-mock-oidc',
    dockerfile: 'tools/BakeryMarketplace.MockOidcHost/Dockerfile',
    args: {},
  },
  {
    app: 'seed',
    kind: 'job',
    repository: 'bakery-seed',
    dockerfile: 'tools/BakeryMarketplace.Seed/Dockerfile',
    args: {},
  },
];

/** A Docker tag may hold letters, digits, '_', '.' and '-', up to 128 characters, and may not start with '.' or '-'. */
export function checkTag(tag) {
  if (typeof tag !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag))
    throw new Error(`not a valid image tag: ${tag}`);
  return tag;
}

/** A registry address: a lower-case host name with an optional port, no scheme or path (Azure gives "<name>.azurecr.io"). */
export function checkRegistry(registry) {
  if (typeof registry !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*(:\d{1,5})?$/.test(registry))
    throw new Error(`not a registry login server: ${registry}`);
  return registry;
}

/** The arguments of one `docker build`, run from the repository root (every Dockerfile here uses the root as its context). */
export function buildArgs(image, tag, revision) {
  const args = ['build', '--file', image.dockerfile, '--tag', `${image.repository}:${checkTag(tag)}`];
  for (const [name, value] of Object.entries(image.args)) args.push('--build-arg', `${name}=${value}`);
  args.push(
    '--label',
    `org.opencontainers.image.revision=${revision}`,
    '--label',
    `org.opencontainers.image.version=${tag}`,
    '.',
  );
  return args;
}

/**
 * The pushed digest of one image, from `docker image inspect` RepoDigests (entries "<registry>/<repository>@sha256:<64 hex>"). Picks the entry
 * for this registry and repository; a local image can carry digests from other registries too.
 */
export function pickDigest(repoDigests, registry, repository) {
  const prefix = `${registry}/${repository}@`;
  const matches = (repoDigests ?? []).filter((d) => d.startsWith(prefix) && /@sha256:[0-9a-f]{64}$/.test(d));
  if (matches.length !== 1)
    throw new Error(
      `expected one digest for ${prefix.slice(0, -1)}, found ${matches.length}: ${JSON.stringify(repoDigests)}`,
    );
  return matches[0];
}

/**
 * Checks the manifest the build wrote against the image list and the ids Docker reports after the load. Returns the problems, empty when the
 * loaded images are exactly the built ones.
 * @param {{tag: string, images: {app: string, repository: string, id: string}[]}} manifest
 * @param {(ref: string) => string|undefined} idOf  the loaded image's id for a local reference, undefined when it is missing
 */
export function verifyLoaded(manifest, idOf) {
  const problems = [];
  const want = IMAGES.map((i) => i.app).sort();
  const have = (manifest?.images ?? []).map((i) => i.app).sort();
  if (JSON.stringify(want) !== JSON.stringify(have))
    problems.push(`the artifact holds ${JSON.stringify(have)}, expected ${JSON.stringify(want)}`);
  for (const image of manifest?.images ?? []) {
    const known = IMAGES.find((i) => i.app === image.app);
    if (known && known.repository !== image.repository)
      problems.push(`${image.app}: repository ${image.repository}, expected ${known.repository}`);
    const ref = `${image.repository}:${manifest.tag}`;
    const id = idOf(ref);
    if (!id) problems.push(`${ref} is not in the loaded images`);
    else if (id !== image.id) problems.push(`${ref} has id ${id}, but the build recorded ${image.id}`);
  }
  return problems;
}

const docker = (args, options = {}) => execFileSync('docker', args, { encoding: 'utf8', ...options });
const imageId = (ref) => {
  try {
    return docker(['image', 'inspect', '--format', '{{.Id}}', ref], { stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
};

async function build({ tag, revision, out }) {
  checkTag(tag);
  if (!/^[0-9a-f]{7,40}$/.test(revision ?? '')) throw new Error(`not a commit id: ${revision}`);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  mkdirSync(out, { recursive: true });
  const images = [];
  for (const image of IMAGES) {
    const started = Date.now();
    console.log(`\n=== ${image.app}: docker build -f ${image.dockerfile} (${image.repository}:${tag})`);
    docker(buildArgs(image, tag, revision), { cwd: root, stdio: 'inherit' });
    const id = imageId(`${image.repository}:${tag}`);
    if (!id) throw new Error(`${image.repository}:${tag} was not found after its build`);
    images.push({ app: image.app, repository: image.repository, id });
    console.log(`${image.app}: built in ${Math.round((Date.now() - started) / 1000)} s, id ${id}`);
  }
  const tar = path.join(out, 'images.tar');
  docker(['image', 'save', '--output', tar, ...images.map((i) => `${i.repository}:${tag}`)], { stdio: 'inherit' });
  await pipeline(createReadStream(tar), createGzip({ level: 1 }), createWriteStream(`${tar}.gz`));
  rmSync(tar);
  writeFileSync(path.join(out, 'images.json'), `${JSON.stringify({ tag, revision, images }, null, 2)}\n`);
  console.log(`\nSaved ${images.length} images to ${tar}.gz; the list is ${path.join(out, 'images.json')}.`);
}

function push({ dir, registry, out }) {
  checkRegistry(registry);
  const manifest = JSON.parse(readFileSync(path.join(dir, 'images.json'), 'utf8'));
  checkTag(manifest.tag);
  docker(['image', 'load', '--input', path.join(dir, 'images.tar.gz')], { stdio: 'inherit' });
  const problems = verifyLoaded(manifest, imageId);
  if (problems.length > 0) {
    console.error('dev images: REFUSED. The loaded images are not the ones the build recorded; nothing is pushed.');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  const pushed = [];
  for (const image of manifest.images) {
    const remote = `${registry}/${image.repository}:${manifest.tag}`;
    docker(['image', 'tag', `${image.repository}:${manifest.tag}`, remote]);
    console.log(`\n=== ${image.app}: docker push ${remote}`);
    docker(['image', 'push', remote], { stdio: 'inherit' });
    const repoDigests = JSON.parse(docker(['image', 'inspect', '--format', '{{json .RepoDigests}}', remote]));
    pushed.push({ app: image.app, image: pickDigest(repoDigests, registry, image.repository) });
  }
  const record = { tag: manifest.tag, revision: manifest.revision, registry, images: pushed };
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`\nPushed ${pushed.length} images (build ${manifest.tag}, commit ${manifest.revision}):`);
  for (const p of pushed) console.log(`  ${p.app.padEnd(12)} ${p.image}`);
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  const get = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  try {
    if (command === 'build' && get('--tag') && get('--revision') && get('--out'))
      return await build({ tag: get('--tag'), revision: get('--revision'), out: get('--out') });
    if (command === 'push' && get('--in') && get('--registry') && get('--out'))
      return push({ dir: get('--in'), registry: get('--registry'), out: get('--out') });
  } catch (e) {
    console.error(`dev images: ${e.message}`);
    process.exit(1);
  }
  console.error(
    'usage: dev-images.mjs build --tag <tag> --revision <commit> --out <dir>\n' +
      '       dev-images.mjs push --in <dir> --registry <login server> --out <record.json>',
  );
  process.exit(2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
