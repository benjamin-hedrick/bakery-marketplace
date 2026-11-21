import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// The deployed suite's global setup (register 228): wakes the apps one at a time before the first test, with scripts/ci/deployed-warm-up.mjs, and
// keeps its record as warm-up.json next to the suite's other evidence. The apps scale to zero when idle; without this the first tests of a run on an
// idle environment fail on the cold starts (about 20 to 45 s an app, one after another). DEPLOYED_WHERE names the machine (agent or lead). A step
// that never answers fails the run here, before any test.
export default function warmUp() {
  const evidence = path.resolve(process.env.DEPLOYED_EVIDENCE_DIR ?? 'artifacts/deployed');
  mkdirSync(evidence, { recursive: true });
  execFileSync(
    process.execPath,
    [
      path.resolve('../../scripts/ci/deployed-warm-up.mjs'),
      '--web',
      process.env.WEB_URL ?? '',
      '--issuer',
      process.env.ISSUER_URL ?? '',
      '--where',
      process.env.DEPLOYED_WHERE ?? 'unnamed',
      '--json',
      path.join(evidence, 'warm-up.json'),
    ],
    { stdio: 'inherit' },
  );
}
