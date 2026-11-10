import { AsyncLocalStorage } from 'node:async_hooks';
import { applies } from './decider.ts';
import { matches, type CallInfo } from './match.ts';
import { ScenarioError, type Scenario } from './scenario.ts';

export interface JournalEntry {
  at: number;
  layer: string;
  fault: string;
  key: string;
  traceId: string | undefined;
}

/** The faults injected while one request was being served, collected through the async flow so the response can say so. Work outside a request has none. */
export interface RequestScope {
  traceId: string | undefined;
  faults: Set<string>;
}

const scopes = new AsyncLocalStorage<RequestScope>();

/** Runs `fn` as one request: every fault injected inside it, however deep in the async flow, is added to the scope. */
export const runInRequestScope = <T>(traceId: string | undefined, fn: () => T): T =>
  scopes.run({ traceId, faults: new Set() }, fn);

/** The distinct "layer:fault" names injected so far in the current request, sorted. */
export const requestFaults = (): string[] => [...(scopes.getStore()?.faults ?? [])].sort();

/** Names the trace of the request being served, once it is known, so journal entries made from then on carry it. */
export const setRequestTrace = (traceId: string): void => {
  const scope = scopes.getStore();
  if (scope) scope.traceId = traceId;
};

/**
 * The record of every fault a scenario injected (ADR-0024). Each entry is also handed to the log function and added to the request being served,
 * if any. A scenario test asserts the journal shows the fault before it asserts the system coped. There is deliberately no endpoint that reads it.
 */
export class ChaosJournal {
  readonly #entries: JournalEntry[] = [];
  readonly #log: ((entry: Record<string, unknown>) => void) | undefined;

  constructor(log?: (entry: Record<string, unknown>) => void) {
    this.#log = log;
  }

  get entries(): readonly JournalEntry[] {
    return [...this.#entries];
  }

  count(layer: string, fault?: string): number {
    return this.#entries.filter((e) => e.layer === layer && (fault === undefined || e.fault === fault)).length;
  }

  /** Counts per "layer:fault", for the summary kept as evidence of a run. */
  summary(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.#entries) out[`${e.layer}:${e.fault}`] = (out[`${e.layer}:${e.fault}`] ?? 0) + 1;
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
  }

  record(layer: string, fault: string, key: string): void {
    const scope = scopes.getStore();
    this.#entries.push({ at: Date.now(), layer, fault, key, traceId: scope?.traceId });
    scope?.faults.add(`${layer}:${fault}`);
    this.#log?.({ msg: 'chaos injected', layer, fault, key, traceId: scope?.traceId });
  }
}

export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

/** The scenario that is on, its clock and its journal. Decorators ask it per operation; nothing in it is random. */
export class ChaosRuntime {
  /** The scenario that is on now; a `switch` signal replaces it. */
  scenario: Scenario;
  readonly journal: ChaosJournal;
  startedAtMs: number;
  readonly #now: () => number;
  readonly #resolve: ((name: string) => Scenario) | undefined;
  readonly #attempts = new Map<string, number>();
  #off: Set<string>;

  constructor(
    scenario: Scenario,
    options: {
      log?: (entry: Record<string, unknown>) => void;
      now?: () => number;
      /** Finds the scenario a `switch` signal names (a file of `chaos/scenarios/`); without it a switch fails. */
      resolveScenario?: (name: string) => Scenario;
    } = {},
  ) {
    this.scenario = scenario;
    this.journal = new ChaosJournal(options.log);
    this.#now = options.now ?? Date.now;
    this.#resolve = options.resolveScenario;
    this.startedAtMs = this.#now();
    this.#off = new Set(scenario.off);
  }

  now = (): number => this.#now();

  /** True when a layer is in the scenario and not switched off. */
  isOn(layer: string): boolean {
    return layer in this.scenario.layers && !this.#off.has(layer);
  }

  /** True when the scenario has signals, so a client must be wrapped even for a layer that is off or not yet in the scenario. */
  get hasSignals(): boolean {
    return this.scenario.signals.length > 0;
  }

  /** Whether a layer disturbs this call: it has no `where`, or the call matches one of its matches. */
  appliesTo(layer: string, call: CallInfo): boolean {
    const wanted = this.scenario.where[layer];
    return wanted === undefined || wanted.some((m) => matches(m, call));
  }

  /**
   * Runs the signals of the scenario that match this call, in order, and returns what they did (also written to the journal, with the call's key). The
   * call itself goes on as normal; the caller judges it after the signals.
   */
  signal(call: CallInfo): string[] {
    const done: string[] = [];
    for (const s of [...this.scenario.signals]) {
      if (!matches(s.when, call)) continue;
      const what =
        s.do === 'enable' || s.do === 'disable'
          ? `${s.do}:${s.layer}`
          : s.do === 'switch'
            ? `switch:${s.scenario}`
            : 'reset';
      if (s.do === 'enable') this.#off.delete(s.layer ?? '');
      else if (s.do === 'disable') this.#off.add(s.layer ?? '');
      else if (s.do === 'reset') this.#restart(this.scenario);
      else if (s.do === 'switch') {
        if (!this.#resolve)
          throw new ScenarioError(
            `Scenario '${this.scenario.name}' has a switch signal but nothing can find scenarios.`,
          );
        this.#restart(this.#resolve(s.scenario ?? ''));
      }
      this.journal.record('signal', what, call.key);
      done.push(what);
    }
    return done;
  }

  /** Starts the counters and the clock again with `scenario` (this one for a reset), its layers as it starts them. */
  #restart(scenario: Scenario): void {
    this.scenario = scenario;
    this.#attempts.clear();
    this.#off = new Set(scenario.off);
    this.startedAtMs = this.#now();
  }

  layer(name: string): ChaosLayer {
    return new ChaosLayer(this, name);
  }

  /** The n-th time this process has seen this operation and key for this fault (1 the first time). */
  nextAttempt(layer: string, fault: string, operationKey: string): number {
    const k = `${layer}|${fault}|${operationKey}`;
    const n = (this.#attempts.get(k) ?? 0) + 1;
    this.#attempts.set(k, n);
    return n;
  }
}

/** One layer of the scenario, as a wrapper sees it. */
export class ChaosLayer {
  readonly #runtime: ChaosRuntime;
  readonly name: string;

  constructor(runtime: ChaosRuntime, name: string) {
    this.#runtime = runtime;
    this.name = name;
  }

  /** True when the layer is in the scenario that is on and not switched off. */
  get active(): boolean {
    return this.#runtime.isOn(this.name);
  }

  /** In the scenario at all, whether or not it is switched off now (a signal may turn it on). */
  get declared(): boolean {
    return this.name in this.#runtime.scenario.layers;
  }

  /** The attempt number of this operation and key for this fault, counted from 1; the first `failFirstAttempts` of them are to fail. */
  failsFirstAttempts(operation: string, key: string): boolean {
    const n = this.setting('failFirstAttempts');
    if (n <= 0) return false;
    const opKey = `${operation}:${key}`;
    if (this.#runtime.nextAttempt(this.name, 'failFirst', opKey) > n) return false;
    this.#runtime.journal.record(this.name, 'failFirst', opKey);
    return true;
  }

  setting(setting: string): number {
    return this.#runtime.scenario.layers[this.name]?.[setting] ?? 0;
  }

  /** Decides from the seed and `key` whether `fault` applies at the rate given by `setting`; when it does, it is written to the journal. */
  inject(fault: string, setting: string, key: string): boolean {
    const rate = this.setting(setting);
    if (!applies(this.#runtime.scenario.seed, this.name, fault, key, rate)) return false;
    this.#runtime.journal.record(this.name, fault, key);
    return true;
  }

  /** As {@link inject}, with the attempt number of this operation and key added to the key, so a retry is judged afresh. */
  injectAttempt(operation: string, key: string, fault: string, setting: string): boolean {
    if (this.setting(setting) <= 0) return false;
    const opKey = `${operation}:${key}`;
    return this.inject(fault, setting, `${opKey}:${this.#runtime.nextAttempt(this.name, fault, opKey)}`);
  }

  /** The ambiguous failure: the work was done, the caller never hears. Call it after the real call and throw when it returns true. */
  lostResponse(operation: string, key: string): boolean {
    return this.injectAttempt(operation, key, 'lostResponse', 'lostResponseRate');
  }

  record(fault: string, key: string): void {
    this.#runtime.journal.record(this.name, fault, key);
  }

  get latencyMs(): number | undefined {
    const ms = this.setting('latencyMs');
    return ms > 0 ? ms : undefined;
  }

  /** True while the outage window is open: from `outageFromSeconds` after the start, for `outageWindowSeconds`. */
  get inOutage(): boolean {
    const window = this.setting('outageWindowSeconds');
    if (window <= 0) return false;
    const elapsed = (this.#runtime.now() - this.#runtime.startedAtMs) / 1000;
    const from = this.setting('outageFromSeconds');
    return elapsed >= from && elapsed < from + window;
  }

  /**
   * What most layers do before the real call: wait (`latencyMs`), fail during the outage window, and fail at the rate given by `setting`, throwing
   * the error `failure` makes. Keyed by operation, key and attempt, so a rerun fails the same calls and a retry is judged afresh.
   */
  async before(
    operation: string,
    key: string,
    fault: string,
    setting: string,
    failure: () => Error,
    signal?: AbortSignal,
  ): Promise<void> {
    const opKey = `${operation}:${key}`;
    const ms = this.latencyMs;
    if (ms !== undefined) {
      this.record('latency', opKey);
      await sleep(ms, signal);
    }
    if (this.inOutage) {
      this.record('outage', opKey);
      throw failure();
    }
    if (
      this.setting(setting) > 0 &&
      this.inject(fault, setting, `${opKey}:${this.#runtime.nextAttempt(this.name, fault, opKey)}`)
    )
      throw failure();
  }
}
