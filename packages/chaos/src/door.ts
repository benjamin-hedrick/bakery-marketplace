import type http from 'node:http';
import { sleep, type ChaosLayer } from './runtime.ts';

/** How long a "never answers" request is held before the connection is dropped, so a test run cannot leak sockets for ever. */
export const HANG_MAX_MS = 120_000;

/** What a door needs from its host to answer for it: how that host writes an error answer and a non-JSON 200. */
export interface DoorAnswers {
  /** Answers `status` (400 to 599) in the host's own error shape. */
  reject(status: number): void;
  /** Answers a 200 whose body is not JSON. */
  malformed(): void;
}

/**
 * The gate at the head of a server's request handler (ADR-0024), shared by the BFF (`bff`) and the web servers' GraphQL routes (`web`). Before anything
 * else is read it can wait, answer a chosen error status, answer a non-JSON body, reset the connection, or never answer; the process stays up and, to the
 * caller, behaves as if it were not. Returns true when it answered (or deliberately did not answer) the request, so the handler stops. The faults are in
 * the journal under the layer's name, keyed by `key`.
 */
export async function runDoor(
  door: ChaosLayer,
  req: Pick<http.IncomingMessage, 'socket'>,
  res: Pick<http.ServerResponse, 'once' | 'destroy'>,
  key: string,
  answers: DoorAnswers,
): Promise<boolean> {
  if (!door.active) return false;

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
    answers.reject(door.setting('rejectStatus') || 503);
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
    answers.malformed();
    return true;
  }
  if (door.inject('reject', 'rejectRate', key)) {
    answers.reject(door.setting('rejectStatus') || 503);
    return true;
  }
  return false;
}
