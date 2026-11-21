import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { RECORD_ARTIFACT, recordRefusals, refusals } from '../promote-check.mjs';

// The shapes are those of the Azure DevOps Builds API (builds/{id}, its timeline and artifacts?artifactName=), cut to the fields the check reads.
const ids = { buildId: '120', pipelineId: '7' };
const passing = () => ({
  build: {
    id: 120,
    definition: { id: 7, name: 'bakery-dev-operations' },
    sourceBranch: 'refs/heads/main',
    sourceVersion: 'abc1234def',
    templateParameters: { action: 'deploy', planMode: 'real', chaosScenario: 'none' },
  },
  timeline: {
    records: [
      { type: 'Stage', identifier: 'app_deploy', state: 'completed', result: 'succeeded' },
      { type: 'Stage', identifier: 'smoke', state: 'completed', result: 'succeeded' },
      { type: 'Job', identifier: 'smoke.smoke', state: 'completed', result: 'succeeded' },
    ],
  },
  artifact: { name: RECORD_ARTIFACT },
});
const smokeAs = (state, result) => {
  const f = passing();
  f.timeline.records[1] = { ...f.timeline.records[1], state, result };
  return f;
};

describe('the promote gate (WI-DEP-002 step 8)', () => {
  test('a real deploy of the dev pipeline from main whose smoke passed is promotable', () => {
    assert.deepEqual(refusals(passing(), ids), []);
  });

  test('a run whose smoke failed, was skipped, was cancelled, is still running or never ran is refused', () => {
    for (const [state, result] of [
      ['completed', 'failed'],
      ['completed', 'skipped'],
      ['completed', 'canceled'],
      ['completed', 'succeededWithIssues'],
      ['inProgress', null],
      ['pending', null],
    ]) {
      const problems = refusals(smokeAs(state, result), ids);
      assert.equal(problems.length, 1, `${state} ${result}`);
      assert.match(problems[0], /only a passing smoke is promoted/);
    }
    const none = passing();
    none.timeline.records = none.timeline.records.filter((r) => r.identifier !== 'smoke');
    assert.match(refusals(none, ids).join('\n'), /has no smoke stage/);
    assert.match(refusals({ ...passing(), timeline: null }, ids).join('\n'), /has no smoke stage/);
  });

  test('a job or task named smoke does not stand in for the stage', () => {
    const f = passing();
    f.timeline.records = [{ type: 'Job', identifier: 'smoke', state: 'completed', result: 'succeeded' }];
    assert.match(refusals(f, ids).join('\n'), /has no smoke stage/);
  });

  test('a run of another pipeline, from another branch, a destroy or a rehearsal is refused', () => {
    const f = (change) => {
      const x = passing();
      change(x.build);
      return refusals(x, ids).join('\n');
    };
    assert.match(
      f((b) => (b.definition.id = 8)),
      /not of the dev pipeline 7/,
    );
    assert.match(
      f((b) => (b.sourceBranch = 'refs/heads/feature/x')),
      /not main/,
    );
    assert.match(
      f((b) => (b.sourceBranch = 'refs/pull/5/merge')),
      /not main/,
    );
    assert.match(
      f((b) => (b.templateParameters.action = 'destroy')),
      /not a deploy/,
    );
    assert.match(
      f((b) => (b.templateParameters.planMode = 'rehearsal')),
      /not real/,
    );
    assert.match(
      f((b) => delete b.templateParameters),
      /not a deploy[\s\S]*not real/,
    );
  });

  test("the promoted record must be that run's, every image by digest in its registry", () => {
    const digest = `sha256:${'a'.repeat(64)}`;
    const record = {
      tag: '120',
      revision: 'abc1234',
      registry: 'bakerytest.azurecr.io',
      images: [{ app: 'web', image: `bakerytest.azurecr.io/bakery-web@${digest}` }],
    };
    assert.deepEqual(recordRefusals(record, '120'), []);
    assert.match(recordRefusals(record, '121').join('\n'), /of build 120, not of run 121/);
    assert.match(recordRefusals({ ...record, images: [] }, '120').join('\n'), /no image/);
    for (const image of [
      `bakerytest.azurecr.io/bakery-web:120`,
      `other.azurecr.io/bakery-web@${digest}`,
      `bakerytest.azurecr.io/bakery-web@sha256:abc`,
    ])
      assert.ok(recordRefusals({ ...record, images: [{ app: 'web', image }] }, '120').length > 0, image);
    assert.ok(recordRefusals({ ...record, registry: 'docker.io' }, '120').length > 0);
    assert.ok(recordRefusals(null, '120').length > 0);
  });

  test('a run without the digest record, a missing run, or an answer for another run is refused', () => {
    assert.match(refusals({ ...passing(), artifact: null }, ids).join('\n'), /published no dev-images-pushed/);
    assert.deepEqual(refusals({ build: null, timeline: null, artifact: null }, ids), ['run 120 was not found']);
    const other = passing();
    other.build.id = 121;
    assert.match(refusals(other, ids).join('\n'), /the answer is run 121/);
  });
});
