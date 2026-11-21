#!/usr/bin/env node
// The application deploy of the environment pipelines (ADR-0020 decision 6: the application stage updates each app to the new digest; register 110:
// it refuses an older build). Runs as the environment's deploy identity in the approved app_deploy job, after the secrets are set and, in dev, the
// images pushed; in UAT the record is the promoted dev run's (WI-DEP-002 step 8), so the build compared is that dev build:
//
//   node scripts/ci/dev-deploy.mjs --record <env>-images-pushed.json --resource-group <name> --suffix <revision suffix> --out <deployed.json>
//       [--seed true|false]    (the run's seed input, WI-DEP-002 step 3; default true, as dev always did)
//
// 1. For every app first, before anything changes: reads the image it runs now. The placeholder Terraform creates it with (or puts back, register
//    217) counts as "no build yet"; an image of this registry counts as the build its tag names (the push tags each image with the build id). It
//    refuses the whole deploy if any app runs a newer build than this one, or an image it cannot place.
//    The seed job's image is checked the same way.
// 2. Runs the seed job (register 224) on its digest and waits until the execution has succeeded; a failed seed stops the deploy before any app changes.
//    With --seed false the job is neither updated nor run (UAT's default: its data is whatever the environment holds).
// 3. Updates each app to its digest from the record, with a new revision named for this run (a new revision also reads the Key Vault secrets the
//    step before may have set), and waits until each new revision is provisioned.
// 4. Writes the record of what each app and job ran before and runs now, and the seed's execution name (its output is in the environment's log).
// Exit code 0 = deployed, 1 = refused or an Azure call failed, 2 = bad usage.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { IMAGES } from './dev-images.mjs';

/** The image the environment module (infra/modules/environment) creates every app with (var.image_placeholder's default). */
export const PLACEHOLDER = 'mcr.microsoft.com/k8se/quickstart:latest';

/** The order of the updates: the issuer first, then the services, the BFF and the web app (each only reaches the ones before it). */
export const ORDER = ['mock-oidc', 'catalog', 'ordering', 'graphql-bff', 'web'];

/** The container app jobs, run once per deploy before the apps are updated: the seed (register 224). */
export const JOBS = ['seed'];

/** The apps with a public address (external ingress in infra/modules/environment): the smoke reaches the environment only through these. */
export const PUBLIC = ['web', 'mock-oidc'];

/** The job execution states Container Apps reports; anything else is still running. */
const DONE_OK = new Set(['Succeeded']);
const DONE_BAD = new Set(['Failed', 'Degraded', 'Stopped']);

/** A revision suffix: lower-case letters, digits and '-', starting with a letter (Container Apps' rule), short enough for every app name. */
export function checkSuffix(suffix) {
  if (typeof suffix !== 'string' || !/^[a-z][a-z0-9-]{0,19}$/.test(suffix) || suffix.endsWith('-'))
    throw new Error(`not a revision suffix: ${suffix}`);
  return suffix;
}

/**
 * Where an app's current image stands. Returns {kind: 'placeholder'} for the placeholder, {kind: 'ours', repository, digest} for an image of
 * this registry by digest, {kind: 'unknown'} for anything else.
 */
export function classify(image, registry) {
  if (image === PLACEHOLDER) return { kind: 'placeholder' };
  const match = new RegExp(`^${registry.replace(/[.]/g, '\\.')}/([a-z0-9-]+)@(sha256:[0-9a-f]{64})$`).exec(image ?? '');
  if (match) return { kind: 'ours', repository: match[1], digest: match[2] };
  return { kind: 'unknown' };
}

/** The build an image belongs to: the largest all-digit tag the registry lists for its digest, or undefined. */
export function buildOf(tags) {
  const builds = (tags ?? []).filter((t) => /^\d+$/.test(t)).map(Number);
  return builds.length ? Math.max(...builds) : undefined;
}

/**
 * Decides whether the deploy may go on. `current` maps each app to {image, build} (build from the registry's tags, or undefined).
 * @returns {string[]} the reasons to refuse, empty when it may go on
 */
export function refusals(record, current) {
  const problems = [];
  const build = Number(record.tag);
  if (!/^\d+$/.test(String(record.tag))) problems.push(`the record's build tag is not a build id: ${record.tag}`);
  const apps = (record.images ?? []).map((i) => i.app).sort();
  const expected = [...ORDER, ...JOBS].sort();
  if (JSON.stringify(apps) !== JSON.stringify(expected))
    problems.push(`the record holds ${JSON.stringify(apps)}, expected ${JSON.stringify(expected)}`);
  for (const app of [...JOBS, ...ORDER]) {
    const now = current[app];
    if (!now) continue;
    const where = classify(now.image, record.registry);
    const repository = IMAGES.find((i) => i.app === app)?.repository;
    if (where.kind === 'placeholder') continue;
    if (where.kind === 'unknown')
      problems.push(`${app} runs ${now.image}, which is neither the placeholder nor an image of this registry`);
    else if (where.repository !== repository)
      problems.push(`${app} runs an image of ${where.repository}, expected ${repository}`);
    else if (now.build === undefined)
      problems.push(`${app} runs ${where.digest}, which has no build tag in the registry`);
    else if (now.build > build)
      problems.push(
        `${app} runs build ${now.build}, newer than this build ${build} (register 110: never deploy an older build)`,
      );
  }
  return problems;
}

/** The arguments that update one app to its digest in a new revision. Output off: the app's JSON lists its configuration. */
export function updateArgs(app, resourceGroup, image, suffix) {
  return [
    'containerapp',
    'update',
    '--name',
    app,
    '--resource-group',
    resourceGroup,
    '--image',
    image,
    '--revision-suffix',
    suffix,
    '--output',
    'none',
  ];
}

/**
 * The deploy.
 * @param {(args: string[]) => string} az  runs the Azure CLI and returns its standard output
 * @param {{wait: (ms: number) => void, now: () => number}} clock
 */
export function deploy(
  { record, resourceGroup, suffix, seed = true, timeoutMs = 600_000, pollMs = 10_000 },
  az,
  clock,
  log = console.log,
) {
  checkSuffix(suffix);
  const deployedAt = new Date(clock.now()).toISOString(); // the start of the observe stage's window (scripts/ci/dev-observe.mjs)
  const registryName = record.registry.split('.')[0];
  const current = {};
  for (const app of [...JOBS, ...ORDER]) {
    const group = JOBS.includes(app) ? ['containerapp', 'job'] : ['containerapp'];
    const image = az([
      ...group,
      'show',
      '--name',
      app,
      '--resource-group',
      resourceGroup,
      '--query',
      'properties.template.containers[0].image',
      '--output',
      'tsv',
    ]).trim();
    const where = classify(image, record.registry);
    let build;
    if (where.kind === 'ours') {
      const meta = JSON.parse(
        az([
          'acr',
          'manifest',
          'show-metadata',
          '--registry',
          registryName,
          '--name',
          `${where.repository}@${where.digest}`,
          '--output',
          'json',
        ]),
      );
      build = buildOf(meta.tags);
    }
    current[app] = { image, build };
    log(
      `${app}: now ${where.kind === 'placeholder' ? 'the placeholder' : image}${build === undefined ? '' : ` (build ${build})`}`,
    );
  }
  const problems = refusals(record, current);
  if (problems.length > 0) {
    const error = new Error('REFUSED; nothing was changed.');
    error.problems = problems;
    throw error;
  }

  // The seed first: the apps' new revisions then find the data, and the catalog applies the seed's VendorVerified events when it starts.
  const jobs = [];
  if (!seed) log(`${JOBS.join(', ')}: not run (this run's seed input is off)`);
  for (const job of seed ? JOBS : []) {
    const image = record.images.find((i) => i.app === job).image;
    az([
      'containerapp',
      'job',
      'update',
      '--name',
      job,
      '--resource-group',
      resourceGroup,
      '--image',
      image,
      '--output',
      'none',
    ]);
    const execution = az([
      'containerapp',
      'job',
      'start',
      '--name',
      job,
      '--resource-group',
      resourceGroup,
      '--query',
      'name',
      '--output',
      'tsv',
    ]).trim();
    if (!execution) throw new Error(`${job}: the job did not start (no execution name)`);
    log(`${job}: execution ${execution} started, ${image}`);
    const deadline = clock.now() + timeoutMs;
    for (;;) {
      const status = az([
        'containerapp',
        'job',
        'execution',
        'show',
        '--name',
        job,
        '--resource-group',
        resourceGroup,
        '--job-execution-name',
        execution,
        '--query',
        'properties.status',
        '--output',
        'tsv',
      ]).trim();
      if (DONE_OK.has(status)) break;
      if (DONE_BAD.has(status))
        throw new Error(`${job}: execution ${execution} ended ${status}; its output is in the environment's log`);
      if (clock.now() >= deadline)
        throw new Error(`${job}: execution ${execution} still ${status || 'unknown'} after ${timeoutMs / 1000} s`);
      clock.wait(pollMs);
    }
    log(`${job}: execution ${execution} succeeded`);
    jobs.push({ job, before: current[job].image, beforeBuild: current[job].build ?? null, image, execution });
  }

  const deployed = [];
  for (const app of ORDER) {
    const image = record.images.find((i) => i.app === app).image;
    az(updateArgs(app, resourceGroup, image, suffix));
    const revision = `${app}--${suffix}`;
    const deadline = clock.now() + timeoutMs;
    for (;;) {
      const state = az([
        'containerapp',
        'revision',
        'show',
        '--name',
        app,
        '--resource-group',
        resourceGroup,
        '--revision',
        revision,
        '--query',
        'properties.provisioningState',
        '--output',
        'tsv',
      ]).trim();
      if (state === 'Provisioned') break;
      if (state === 'Failed') throw new Error(`${app}: revision ${revision} failed to provision`);
      if (clock.now() >= deadline)
        throw new Error(`${app}: revision ${revision} still ${state || 'unknown'} after ${timeoutMs / 1000} s`);
      clock.wait(pollMs);
    }
    log(`${app}: revision ${revision} provisioned, ${image}`);
    deployed.push({ app, before: current[app].image, beforeBuild: current[app].build ?? null, image, revision });
  }
  // The public addresses, for the smoke stage (the deployed suite and the latency run reach the environment only through them).
  const urls = {};
  for (const app of PUBLIC) {
    const fqdn = az([
      'containerapp',
      'show',
      '--name',
      app,
      '--resource-group',
      resourceGroup,
      '--query',
      'properties.configuration.ingress.fqdn',
      '--output',
      'tsv',
    ]).trim();
    if (!/^[a-z0-9.-]+$/.test(fqdn)) throw new Error(`${app}: no public address (${fqdn || 'none'})`);
    urls[app] = `https://${fqdn}`;
  }
  return { build: record.tag, revision: record.revision, deployedAt, seeded: seed, jobs, deployed, urls };
}

function main() {
  const argv = process.argv.slice(2);
  const get = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const [recordPath, resourceGroup, suffix, out, seedArg] = [
    '--record',
    '--resource-group',
    '--suffix',
    '--out',
    '--seed',
  ].map(get);
  const seed = seedArg === undefined || /^true$/i.test(seedArg);
  if (!recordPath || !resourceGroup || !suffix || !out || (seedArg !== undefined && !/^(true|false)$/i.test(seedArg))) {
    console.error(
      'usage: dev-deploy.mjs --record <env-images-pushed.json> --resource-group <name> --suffix <revision suffix> --out <deployed.json> [--seed true|false]',
    );
    process.exit(2);
  }
  const az = (args) => execFileSync('az', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const clock = {
    now: () => Date.now(),
    wait: (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
  };
  try {
    const result = deploy(
      { record: JSON.parse(readFileSync(recordPath, 'utf8')), resourceGroup, suffix, seed },
      az,
      clock,
    );
    writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`dev deploy: build ${result.build} runs in all ${result.deployed.length} apps.`);
  } catch (e) {
    console.error(`dev deploy: ${e.message.split('\n')[0]}`);
    for (const p of e.problems ?? []) console.error(`  - ${p}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
