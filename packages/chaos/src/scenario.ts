import { readFileSync } from 'node:fs';

/**
 * Every layer and the settings it accepts. A copy of `chaos/layers.json` (and of ChaosScenario.Known in the C# library); the tests of both languages
 * check their copy against that file, so none of them can drift.
 */
export const KNOWN_LAYERS: Readonly<Record<string, readonly string[]>> = {
  events: [
    'publishFailureRate',
    'publishLostResponseRate',
    'dropRate',
    'duplicateRate',
    'reorderRate',
    'handlerFailureRate',
    'latencyMs',
    'outageFromSeconds',
    'outageWindowSeconds',
  ],
  cache: ['failureRate', 'deleteFailureRate', 'latencyMs', 'outageFromSeconds', 'outageWindowSeconds'],
  repository: [
    'failureRate',
    'lostResponseRate',
    'conflictRate',
    'latencyMs',
    'outageFromSeconds',
    'outageWindowSeconds',
  ],
  broadcast: ['failureRate', 'dropRate', 'deliveryDropRate', 'latencyMs', 'outageFromSeconds', 'outageWindowSeconds'],
  payment: ['failureRate', 'lostResponseRate', 'declineRate', 'latencyMs', 'outageFromSeconds', 'outageWindowSeconds'],
  catalog: [
    'unavailableRate',
    'lostResponseRate',
    'rejectRate',
    'latencyMs',
    'outageFromSeconds',
    'outageWindowSeconds',
  ],
  contacts: ['failureRate', 'latencyMs', 'outageFromSeconds', 'outageWindowSeconds'],
  notification: ['failureRate', 'lostResponseRate', 'latencyMs', 'outageFromSeconds', 'outageWindowSeconds'],
  bff: [
    'rejectRate',
    'rejectStatus',
    'malformedRate',
    'resetRate',
    'hangRate',
    'latencyMs',
    'outageFromSeconds',
    'outageWindowSeconds',
  ],
  web: [
    'rejectRate',
    'rejectStatus',
    'malformedRate',
    'resetRate',
    'hangRate',
    'latencyMs',
    'outageFromSeconds',
    'outageWindowSeconds',
  ],
  bffCatalog: [
    'failFirstAttempts',
    'unavailableRate',
    'serverErrorRate',
    'malformedRate',
    'lostResponseRate',
    'latencyMs',
    'outageFromSeconds',
    'outageWindowSeconds',
  ],
  bffOrdering: [
    'failFirstAttempts',
    'unavailableRate',
    'serverErrorRate',
    'malformedRate',
    'lostResponseRate',
    'latencyMs',
    'outageFromSeconds',
    'outageWindowSeconds',
  ],
};

/** What a signal can do (a copy of `signalActions` in `chaos/layers.json`, checked by the tests of both languages). */
export const SIGNAL_ACTIONS: readonly string[] = ['enable', 'disable', 'switch', 'reset'];

/** The sections of a scenario file besides `name`, `seed` and `layers` (a copy of `sections` in `chaos/layers.json`). */
export const SCENARIO_SECTIONS: readonly string[] = ['where', 'off', 'signals'];

export class ScenarioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioError';
  }
}

/**
 * Which calls a rule is about. Every part that is given must hold. `operation` is the client method (`placeOrder`), `customer` the `sub` of the caller's
 * bearer token (read, not verified: it only chooses which calls are disturbed), `key` the call's key (an id or an idempotency key), `payload` a pattern the
 * call's first object or array argument must contain (every property named must be equal; an array must have the same length and each element contain the
 * pattern's). `client` (signals only) is the wrapped client the call went through.
 */
export interface Match {
  client?: string;
  operation?: string;
  customer?: string;
  key?: string;
  payload?: unknown;
}

/**
 * A request that changes the chaos state: a normal request that matches `when`, as the scenario file says (a request never carries settings or names a
 * scenario). `enable` and `disable` turn the layer `layer` on or off, `switch` loads the scenario file called `scenario`, `reset` starts the counters and the
 * clock again and puts the layers back as the scenario starts them. The matched request goes on as normal and is judged after the signal.
 */
export interface Signal {
  when: Match;
  do: string;
  layer?: string;
  scenario?: string;
}

export interface Scenario {
  name: string;
  /** A whole number of up to 64 bits: a bigint, because it is part of the text that is hashed. */
  seed: bigint;
  layers: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** A layer named here disturbs only the calls that match one of its matches; a layer not named disturbs every call. */
  where: Readonly<Record<string, readonly Match[]>>;
  /** Layers that start switched off (a signal can enable them). */
  off: readonly string[];
  signals: readonly Signal[];
}

export interface ScenarioExtras {
  where?: Record<string, unknown>;
  off?: string[];
  signals?: unknown[];
}

const isRate = (setting: string) => setting.endsWith('Rate');
const isCount = (setting: string) => setting === 'failFirstAttempts';
const MATCH_KEYS = ['client', 'operation', 'customer', 'key', 'payload'];
const SIGNAL_KEYS = ['when', 'do', 'layer', 'scenario'];

function checkMatch(name: string, where: string, value: unknown): Match {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ScenarioError(`Scenario '${name}': ${where} must be an object (${MATCH_KEYS.join(', ')}).`);
  const out: Match = {};
  for (const [k, v] of Object.entries(value)) {
    if (!MATCH_KEYS.includes(k))
      throw new ScenarioError(`Scenario '${name}': ${where} has no property '${k}'. Known: ${MATCH_KEYS.join(', ')}.`);
    if (k === 'payload') out.payload = v;
    else if (typeof v !== 'string' || !v.trim())
      throw new ScenarioError(`Scenario '${name}': ${where}.${k} must be a non-empty string.`);
    else (out as Record<string, string>)[k] = v;
  }
  if (Object.keys(out).length === 0)
    throw new ScenarioError(`Scenario '${name}': ${where} matches everything; leave it out instead.`);
  return out;
}

function checkExtras(
  name: string,
  layers: Record<string, unknown>,
  extras: ScenarioExtras,
): { where: Record<string, Match[]>; off: string[]; signals: Signal[] } {
  const known = (layer: string, at: string) => {
    if (!KNOWN_LAYERS[layer])
      throw new ScenarioError(`Scenario '${name}': ${at} names layer '${layer}', which is not built.`);
  };
  const present = (layer: string, at: string) => {
    known(layer, at);
    if (!(layer in layers))
      throw new ScenarioError(`Scenario '${name}': ${at} names layer '${layer}', which the scenario does not have.`);
  };
  const where: Record<string, Match[]> = {};
  for (const [layer, matches] of Object.entries(extras.where ?? {})) {
    present(layer, 'where');
    if (!Array.isArray(matches) || matches.length === 0)
      throw new ScenarioError(`Scenario '${name}': where.${layer} must be a list of matches.`);
    where[layer] = matches.map((m, i) => checkMatch(name, `where.${layer}[${i}]`, m));
  }
  for (const layer of extras.off ?? []) present(layer, 'off');
  const signals = (extras.signals ?? []).map((value, i): Signal => {
    const at = `signals[${i}]`;
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw new ScenarioError(`Scenario '${name}': ${at} must be an object.`);
    const raw = value as Record<string, unknown>;
    for (const k of Object.keys(raw))
      if (!SIGNAL_KEYS.includes(k))
        throw new ScenarioError(`Scenario '${name}': ${at} has no property '${k}' (${SIGNAL_KEYS.join(', ')}).`);
    const action = raw.do;
    if (typeof action !== 'string' || !SIGNAL_ACTIONS.includes(action))
      throw new ScenarioError(
        `Scenario '${name}': ${at}.do '${String(action)}' is not an action. Known: ${SIGNAL_ACTIONS.join(', ')}.`,
      );
    const when = checkMatch(name, `${at}.when`, raw.when);
    if (when.client !== undefined) known(when.client, `${at}.when.client`);
    const signal: Signal = { when, do: action };
    if (action === 'enable' || action === 'disable') {
      if (typeof raw.layer !== 'string')
        throw new ScenarioError(`Scenario '${name}': ${at} (${action}) needs a layer.`);
      present(raw.layer, at);
      signal.layer = raw.layer;
    } else if (raw.layer !== undefined)
      throw new ScenarioError(`Scenario '${name}': ${at} (${action}) takes no layer.`);
    if (action === 'switch') {
      if (typeof raw.scenario !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(raw.scenario))
        throw new ScenarioError(
          `Scenario '${name}': ${at} (switch) needs the plain name of a scenario file, not a path.`,
        );
      signal.scenario = raw.scenario;
    } else if (raw.scenario !== undefined)
      throw new ScenarioError(`Scenario '${name}': ${at} (${action}) takes no scenario.`);
    return signal;
  });
  return { where, off: [...(extras.off ?? [])], signals };
}

/** Checks a scenario's layers and settings the way the C# library does: a typo or a layer nobody knows fails loudly, it never does nothing silently. */
export function validate(
  name: string,
  seed: bigint,
  layers: Record<string, Record<string, number>>,
  extras: ScenarioExtras = {},
): Scenario {
  if (!name.trim()) throw new ScenarioError('A scenario needs a name.');
  for (const [layer, settings] of Object.entries(layers)) {
    const allowed = KNOWN_LAYERS[layer];
    if (!allowed)
      throw new ScenarioError(
        `Scenario '${name}': layer '${layer}' is not built. Known layers: ${Object.keys(KNOWN_LAYERS).join(', ')}.`,
      );
    for (const [setting, value] of Object.entries(settings)) {
      if (!allowed.includes(setting))
        throw new ScenarioError(
          `Scenario '${name}': layer '${layer}' has no setting '${setting}'. Known: ${[...allowed].sort().join(', ')}.`,
        );
      if (Number.isNaN(value) || value < 0 || (isRate(setting) && value > 1))
        throw new ScenarioError(
          `Scenario '${name}': ${layer}.${setting} must be ${isRate(setting) ? 'between 0 and 1' : '0 or more'}, not ${value}.`,
        );
      if (isCount(setting) && !Number.isInteger(value))
        throw new ScenarioError(`Scenario '${name}': ${layer}.${setting} must be a whole number, not ${value}.`);
      if (setting === 'rejectStatus' && (!Number.isInteger(value) || value < 400 || value > 599))
        throw new ScenarioError(
          `Scenario '${name}': ${layer}.${setting} must be a whole HTTP status from 400 to 599, not ${value}.`,
        );
    }
  }
  return { name, seed, layers, ...checkExtras(name, layers, extras) };
}

/** Parses scenario JSON. The seed keeps all its digits (a 64-bit seed does not fit a JSON number as read by JSON.parse), so it is taken from the source text. */
export function parseScenario(json: string): Scenario {
  let root: unknown;
  try {
    root = JSON.parse(json, (key, value: unknown, context?: { source?: string }) => {
      if (key === 'seed' && typeof value === 'number' && context?.source !== undefined) {
        if (!/^-?\d+$/.test(context.source)) throw new ScenarioError('The seed must be a whole number.');
        return BigInt(context.source);
      }
      return value;
    });
  } catch (e) {
    if (e instanceof ScenarioError) throw e;
    throw new ScenarioError(`The scenario is not valid JSON: ${e instanceof Error ? e.message : 'error'}`);
  }
  if (typeof root !== 'object' || root === null || Array.isArray(root))
    throw new ScenarioError('A scenario must be a JSON object.');
  let name: string | undefined;
  let seed: bigint | undefined;
  const layers: Record<string, Record<string, number>> = {};
  const extras: ScenarioExtras = {};
  for (const [key, value] of Object.entries(root)) {
    if (key === 'name' && typeof value === 'string') name = value;
    else if (key === 'seed' && typeof value === 'bigint') seed = value;
    else if (key === 'layers' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [layer, settings] of Object.entries(value)) {
        if (typeof settings !== 'object' || settings === null || Array.isArray(settings))
          throw new ScenarioError(`Layer '${layer}' must be an object of settings.`);
        const out: Record<string, number> = {};
        for (const [setting, v] of Object.entries(settings)) {
          if (typeof v !== 'number') throw new ScenarioError(`${layer}.${setting} must be a number.`);
          out[setting] = v;
        }
        layers[layer] = out;
      }
    } else if (key === 'where' && typeof value === 'object' && value !== null && !Array.isArray(value))
      extras.where = value as Record<string, unknown>;
    else if (key === 'off' && Array.isArray(value) && value.every((v) => typeof v === 'string'))
      extras.off = value as string[];
    else if (key === 'signals' && Array.isArray(value)) extras.signals = value as unknown[];
    else
      throw new ScenarioError(
        `Unexpected or mistyped property '${key}' (a scenario has name, seed, layers and, optionally, ${SCENARIO_SECTIONS.join(', ')}).`,
      );
  }
  if (name === undefined) throw new ScenarioError('A scenario needs a name.');
  if (seed === undefined) throw new ScenarioError(`Scenario '${name}' needs a seed (a whole number).`);
  return validate(name, seed, layers, extras);
}

export const loadScenario = (path: string): Scenario => parseScenario(readFileSync(path, 'utf8'));

/** A one-layer scenario, for tests and small programs. */
export const scenarioOf = (
  name: string,
  seed: bigint | number,
  layer: string,
  settings: Record<string, number> = {},
): Scenario => validate(name, BigInt(seed), { [layer]: settings });
