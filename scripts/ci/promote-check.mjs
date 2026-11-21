#!/usr/bin/env node
// The promote gate of the UAT pipeline (ADR-0020 decision 9: promotion requires a recorded passing smoke in the previous environment; WI-DEP-002
// step 8). Runs in the UAT run's inputs stage, before any approval, with the job's own Azure DevOps token and no Azure connection:
//
//   node scripts/ci/promote-check.mjs --build <dev run id> --pipeline-id <the dev pipeline's definition id>
//       (reads SYSTEM_ACCESSTOKEN, SYSTEM_COLLECTIONURI and SYSTEM_TEAMPROJECT from the job's environment)
//
// It refuses unless the run is a run of the dev pipeline, from main, a real deploy (action deploy, planMode real), its smoke stage succeeded, and
// it published the record of the pushed digests (dev-images-pushed), which is what UAT deploys: no image is built for UAT.
// Exit code 0 = promotable, 1 = refused, 2 = bad usage or an Azure DevOps call that failed.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The artifact a dev run publishes with each app's image by digest (pipelines/templates/environment-stages.yml, app_deploy). */
export const RECORD_ARTIFACT = 'dev-images-pushed';

/**
 * Decides whether a dev run may be promoted. `build` is the Builds API's answer, `timeline` its timeline, `artifact` the named artifact or null.
 * @returns {string[]} the reasons to refuse, empty when it may be promoted
 */
export function refusals({ build, timeline, artifact }, { buildId, pipelineId }) {
  const problems = [];
  if (!build) return [`run ${buildId} was not found`];
  if (String(build.id) !== String(buildId)) problems.push(`asked for run ${buildId}, the answer is run ${build.id}`);
  if (String(build.definition?.id) !== String(pipelineId))
    problems.push(
      `run ${buildId} is a run of pipeline ${build.definition?.id} (${build.definition?.name}), not of the dev pipeline ${pipelineId}`,
    );
  if (build.sourceBranch !== 'refs/heads/main')
    problems.push(`run ${buildId} ran from ${build.sourceBranch}, not main`);
  const parameters = build.templateParameters ?? {};
  if (parameters.action !== 'deploy')
    problems.push(`run ${buildId} was not a deploy (action ${parameters.action ?? 'unknown'})`);
  if (parameters.planMode !== 'real')
    problems.push(`run ${buildId} was not real (planMode ${parameters.planMode ?? 'unknown'})`);
  const smoke = (timeline?.records ?? []).filter((r) => r.type === 'Stage' && r.identifier === 'smoke');
  if (smoke.length === 0) problems.push(`run ${buildId} has no smoke stage`);
  else if (smoke.length > 1) problems.push(`run ${buildId} has ${smoke.length} smoke stages`);
  else if (smoke[0].state !== 'completed' || smoke[0].result !== 'succeeded')
    problems.push(
      `run ${buildId}'s smoke stage is ${smoke[0].state}, result ${smoke[0].result ?? 'none'}: only a passing smoke is promoted`,
    );
  if (!artifact) problems.push(`run ${buildId} published no ${RECORD_ARTIFACT} artifact (the digests to deploy)`);
  return problems;
}

/**
 * The promoted record, checked before UAT uses it (the images stage, after downloading it from the dev run): it must be that run's record, with
 * every image by digest in one registry. dev-deploy.mjs checks again that it names every app and job.
 * @returns {string[]} the reasons to refuse
 */
export function recordRefusals(record, buildId) {
  const problems = [];
  if (String(record?.tag) !== String(buildId))
    problems.push(`the record is of build ${record?.tag}, not of run ${buildId}`);
  if (!/^[a-z0-9]+\.azurecr\.io$/.test(record?.registry ?? ''))
    problems.push(`the record names no registry (${record?.registry})`);
  const images = record?.images ?? [];
  if (images.length === 0) problems.push('the record holds no image');
  for (const i of images)
    if (
      !new RegExp(`^${String(record.registry).replace(/[.]/g, '\\.')}/[a-z0-9-]+@sha256:[0-9a-f]{64}$`).test(
        i.image ?? '',
      )
    )
      problems.push(`${i.app}: ${i.image} is not an image of ${record.registry} by digest`);
  return problems;
}

async function main() {
  const argv = process.argv.slice(2);
  const get = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const buildId = get('--build');
  const pipelineId = get('--pipeline-id');
  const recordIn = get('--record');
  if (recordIn !== undefined) {
    // node scripts/ci/promote-check.mjs --build <dev run id> --record <downloaded dev-images-pushed.json> --out <the environment's copy>
    const out = get('--out');
    if (!/^[1-9]\d*$/.test(buildId ?? '') || !out) {
      console.error('usage: promote-check.mjs --build <dev run id> --record <dev-images-pushed.json> --out <file>');
      process.exit(2);
    }
    const record = JSON.parse(readFileSync(recordIn, 'utf8'));
    const problems = recordRefusals(record, buildId);
    if (problems.length > 0) {
      for (const p of problems) console.log(`##vso[task.logissue type=error]The promoted record: ${p}`);
      process.exit(1);
    }
    writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
    console.log(
      `The record of dev run ${buildId}: ${record.images.length} images by digest, commit ${record.revision ?? 'unknown'}.`,
    );
    return;
  }
  const { SYSTEM_ACCESSTOKEN: token, SYSTEM_COLLECTIONURI: collection, SYSTEM_TEAMPROJECT: project } = process.env;
  if (!/^[1-9]\d*$/.test(buildId ?? '') || !/^[1-9]\d*$/.test(pipelineId ?? '')) {
    console.log(
      '##vso[task.logissue type=error]promote check: --build and --pipeline-id must be run and pipeline ids (devBuild, DEV_PIPELINE_ID).',
    );
    process.exit(2);
  }
  if (!token || !collection || !project) {
    console.error(
      'promote check: SYSTEM_ACCESSTOKEN, SYSTEM_COLLECTIONURI and SYSTEM_TEAMPROJECT are needed (map System.AccessToken in the step).',
    );
    process.exit(2);
  }
  const base = `${collection.replace(/\/$/, '')}/${encodeURIComponent(project)}/_apis/build/builds/${buildId}`;
  const ask = async (url, { missingOk = false } = {}) => {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
    if (missingOk && res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status} from ${url.replace(collection, '<collection>/')}`);
    return res.json();
  };
  let facts;
  try {
    facts = {
      build: await ask(`${base}?api-version=7.1`, { missingOk: true }),
      timeline: await ask(`${base}/timeline?api-version=7.1`, { missingOk: true }),
      artifact: await ask(`${base}/artifacts?artifactName=${RECORD_ARTIFACT}&api-version=7.1`, { missingOk: true }),
    };
  } catch (e) {
    console.log(`##vso[task.logissue type=error]promote check: an Azure DevOps call failed: ${e.message}`);
    process.exit(2);
  }
  const problems = refusals(facts, { buildId, pipelineId });
  if (problems.length > 0) {
    for (const p of problems) console.log(`##vso[task.logissue type=error]Not promotable: ${p}`);
    process.exit(1);
  }
  console.log(
    `Run ${buildId} of the dev pipeline (${facts.build.sourceVersion?.slice(0, 7) ?? 'unknown commit'}, main) deployed for real and its smoke passed: promotable.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
