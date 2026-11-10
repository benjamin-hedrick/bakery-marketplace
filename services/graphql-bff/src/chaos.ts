import type http from 'node:http';
import {
  ChaosRuntime,
  describeCall,
  indicatorHeaders,
  requestFaults,
  runInRequestScope,
  setRequestTrace,
  sleep,
  type ChaosLayer,
} from '@bakery/chaos';
import { DownstreamError } from './errors.ts';
import type { TraceContext } from './trace.ts';

// Chaos scenarios for the BFF (ADR-0024). Two kinds of layer, both outside the BFF's own logic:
//   `bff`                     a gate at the head of the request handler: before the body is read it can wait, answer a chosen error status, answer a
//                             non-JSON body, reset the connection, or never answer. The process stays up; to the caller the BFF behaves as if it were not.
//   `bffCatalog`/`bffOrdering` a wrapper around a service client: the call fails as an unreachable service does, answers a 5xx, answers a body that is
//                             not JSON, or succeeds and then loses its answer. The errors are the DownstreamError the real clients throw.
// Faults a service injects (ordering, catalog) are reported by that service, not copied here; the journals are joined by trace id.

/** How long a "never answers" request is held before the connection is dropped, so a test run cannot leak sockets for ever. */
const HANG_MAX_MS = 120_000;

type Send = (code: number, body: unknown) => void;

export class BffChaos {
  readonly runtime: ChaosRuntime;
  readonly #door: ChaosLayer;
  #seq = 0;

  constructor(runtime: ChaosRuntime) {
    this.runtime = runtime;
    this.#door = runtime.layer('bff');
  }

  /** Runs one request: the faults injected anywhere inside it are collected for the response. */
  scoped<T>(fn: () => T): T {
    return runInRequestScope(undefined, fn);
  }

  /** Called once the request's trace is known, so journal entries carry it and journals of several processes can be joined. */
  bindTrace(traceId: string): void {
    setRequestTrace(traceId);
  }

  /** `X-Chaos-Scenario` always, `X-Chaos-Injected` for the faults injected while this response was produced. Response-only: no request header changes anything. */
  headers(): Record<string, string> {
    return indicatorHeaders(this.runtime, requestFaults());
  }

  /** Adds `extensions.chaos` (scenario and injected faults) to a GraphQL response body; anything else is left as it is. */
  decorate(body: unknown): unknown {
    if (typeof body !== 'object' || body === null || Array.isArray(body) || !('errors' in body || 'data' in body))
      return body;
    const existing = (body as { extensions?: Record<string, unknown> }).extensions;
    return {
      ...body,
      extensions: { ...existing, chaos: { scenario: this.runtime.scenario.name, injected: requestFaults() } },
    };
  }

  /** The gate. Returns true when it answered (or deliberately did not answer) the request, so the handler stops. */
  async gate(req: http.IncomingMessage, res: http.ServerResponse, trace: TraceContext, send: Send): Promise<boolean> {
    const door = this.#door;
    if (!door.active) return false;
    // A caller that sets its own traceparent chooses the key, so a test can say which requests will be hit; otherwise it is the request's number.
    const key = trace.continued ? trace.traceId : `seq:${++this.#seq}`;

    const latency = door.latencyMs;
    if (latency !== undefined) {
      door.record('latency', key);
      const gone = new AbortController();
      res.once('close', () => gone.abort());
      await sleep(latency, gone.signal);
      if (gone.signal.aborted) return true;
    }

    if (door.inOutage) {
      door.record('outage', key);
      this.#reject(res, send);
      return true;
    }
    if (door.inject('reset', 'resetRate', key)) {
      req.socket.destroy();
      return true;
    }
    if (door.inject('hang', 'hangRate', key)) {
      const timer = setTimeout(() => res.destroy(), HANG_MAX_MS);
      timer.unref();
      res.once('close', () => clearTimeout(timer));
      return true; // no answer; the caller's own timeout ends it
    }
    if (door.inject('malformed', 'malformedRate', key)) {
      res.writeHead(200, {
        'content-type': 'text/html',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'x-correlation-id': trace.traceId,
        ...this.headers(),
      });
      res.end('<html><body>Bad gateway</body></html>');
      return true;
    }
    if (door.inject('reject', 'rejectRate', key)) {
      this.#reject(res, send);
      return true;
    }
    return false;
  }

  #reject(res: http.ServerResponse, send: Send): void {
    const status = this.#door.setting('rejectStatus') || 503;
    if (status === 429) res.setHeader('retry-after', '1');
    send(status, {
      errors: [
        {
          message: 'The service is temporarily unavailable. Please try again.',
          extensions: { code: status === 429 ? 'RATE_LIMITED' : 'UNAVAILABLE' },
        },
      ],
    });
  }

  /**
   * Wraps a service client (an object of async methods) with the named layer. Each call can wait, fail as an unreachable service does, answer a 5xx,
   * answer a body that is not JSON, or succeed and then lose its answer. The messages are those of the real clients' DownstreamError (a name or a status,
   * never a URL or a credential). With no such layer in the scenario the client is returned as it is.
   */
  wrap<T extends object>(client: T, layerName: 'bffCatalog' | 'bffOrdering', service: string): T {
    const runtime = this.runtime;
    const layer = runtime.layer(layerName);
    // A client is wrapped when its layer is in the scenario (even switched off: a signal may turn it on) or when the scenario has signals (a signal may
    // enable the layer, or switch to a scenario that has it).
    if (!layer.declared && !runtime.hasSignals) return client;
    return new Proxy(client, {
      get(target, prop, receiver) {
        const value: unknown = Reflect.get(target, prop, receiver);
        if (typeof value !== 'function' || typeof prop !== 'string') return value;
        return async (...args: unknown[]) => {
          const call = describeCall(layerName, prop, args);
          runtime.signal(call); // a signal changes the state for this call as well as the later ones
          if (!layer.active || !runtime.appliesTo(layerName, call))
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          const key = call.key;
          if (layer.failsFirstAttempts(prop, key)) throw new DownstreamError(`${service} request failed: TypeError`);
          await layer.before(
            prop,
            key,
            'unavailable',
            'unavailableRate',
            () => new DownstreamError(`${service} request failed: TypeError`),
          );
          if (layer.injectAttempt(prop, key, 'serverError', 'serverErrorRate'))
            throw new DownstreamError(`${service} ${prop} returned 503`, 503);
          if (layer.injectAttempt(prop, key, 'malformed', 'malformedRate'))
            throw new DownstreamError(`${service} returned a body that is not JSON`, 200);
          const result: unknown = await (value as (...a: unknown[]) => unknown).apply(target, args);
          if (layer.lostResponse(prop, key)) throw new DownstreamError(`${service} request failed: TimeoutError`);
          return result;
        };
      },
    });
  }
}
