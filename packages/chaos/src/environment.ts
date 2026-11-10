import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChaosRuntime } from './runtime.ts';
import { loadScenario, ScenarioError } from './scenario.ts';

/**
 * Where chaos may run (ADR-0024): local development and tests, and the dev deployment; UAT and production refuse it. A Node process has no host
 * environment name like ASP.NET's, and the container image sets `NODE_ENV=production` everywhere, so the environment is named by
 * `DEPLOYMENT_ENVIRONMENT` (`local` or `dev`); `NODE_ENV` of `development` or `test` also counts. Only the dev and local configuration may set it.
 */
export function isAllowed(nodeEnv: string | undefined, deploymentEnvironment: string | undefined): boolean {
  const deployment = deploymentEnvironment?.toLowerCase();
  return deployment === 'dev' || deployment === 'local' || nodeEnv === 'development' || nodeEnv === 'test';
}

export function requireAllowed(nodeEnv: string | undefined, deploymentEnvironment: string | undefined): void {
  if (!isAllowed(nodeEnv, deploymentEnvironment))
    throw new Error(
      `Chaos cannot run with NODE_ENV '${nodeEnv ?? '(none)'}' and DEPLOYMENT_ENVIRONMENT '${deploymentEnvironment ?? '(none)'}'. ` +
        'It is allowed only locally and in the dev deployment (ADR-0024); this is a hard safety gate, not a configuration oversight.',
    );
}

/** Finds a scenario by name: a path as given, or `chaos/scenarios/<name>.json` searched upward from the working directory and from this package. */
export function locateScenario(reference: string, cwd: string = process.cwd()): string {
  if (reference.endsWith('.json') || reference.includes('/') || reference.includes('\\')) {
    const full = path.resolve(cwd, reference);
    if (!existsSync(full)) throw new ScenarioError(`Chaos scenario file not found: ${full}`);
    return full;
  }
  for (const start of [cwd, path.dirname(fileURLToPath(import.meta.url))]) {
    for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, 'chaos', 'scenarios', `${reference}.json`);
      if (existsSync(candidate)) return candidate;
      if (path.dirname(dir) === dir) break;
    }
  }
  throw new ScenarioError(`Chaos scenario '${reference}' not found under any chaos/scenarios folder above ${cwd}.`);
}

/**
 * The one place a Node process switches chaos on: with `CHAOS_ENABLED` unset or false it returns nothing. With it set it checks the gate, loads the
 * scenario named by `CHAOS_SCENARIO` and returns the runtime; the process then wraps what it has (the BFF: its door and its service clients).
 */
export function chaosFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: { cwd?: string; log?: (entry: Record<string, unknown>) => void } = {},
): ChaosRuntime | undefined {
  if (env.CHAOS_ENABLED !== 'true' && env.CHAOS_ENABLED !== '1') return undefined;
  requireAllowed(env.NODE_ENV, env.DEPLOYMENT_ENVIRONMENT); // fails at startup, not at first use
  const reference = env.CHAOS_SCENARIO;
  if (!reference?.trim()) throw new Error('CHAOS_ENABLED is true but CHAOS_SCENARIO names no scenario.');
  const scenario = loadScenario(locateScenario(reference, options.cwd));
  // A `switch` signal names a plain scenario file of `chaos/scenarios/` (the scenario's own validation refuses a path), found the same way.
  const resolveScenario = (name: string) => loadScenario(locateScenario(name, options.cwd));
  return new ChaosRuntime(scenario, { resolveScenario, ...(options.log === undefined ? {} : { log: options.log }) });
}

/** The response indicator (ADR-0024): the scenario name always, the faults injected while this response was produced when there were any. Names only: no keys, ids, payloads or seed. */
export function indicatorHeaders(runtime: ChaosRuntime, faults: readonly string[]): Record<string, string> {
  return {
    'x-chaos-scenario': runtime.scenario.name,
    ...(faults.length > 0 ? { 'x-chaos-injected': faults.join(',') } : {}),
  };
}
