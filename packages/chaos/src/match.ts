import type { Match } from './scenario.ts';

/** One call of a wrapped client, as a rule sees it. Built from the method name and its arguments; never stored or logged. */
export interface CallInfo {
  client: string;
  operation: string;
  /** The first string argument that is not a credential (an id, an idempotency key); the method name when there is none. */
  key: string;
  /** The `sub` of the bearer token the call carries, when there is one that can be read. Read, not verified: it only chooses which calls are disturbed. */
  customer: string | undefined;
  /** The first object or array argument that is not the trace context. */
  payload: unknown;
}

const isCredential = (a: unknown): boolean => typeof a === 'string' && /^(bearer|basic)\s/i.test(a);
const isTrace = (a: unknown): boolean =>
  typeof a === 'object' && a !== null && !Array.isArray(a) && 'traceId' in a && 'continued' in a;

/** The `sub` claim of a bearer token's payload, or undefined (not a bearer, not a three-part token, not JSON, no string `sub`). The signature is not checked. */
export function customerOf(authorization: string): string | undefined {
  const parts = /^bearer\s+(\S+)$/i.exec(authorization)?.[1]?.split('.');
  if (parts?.length !== 3 || !parts[1]) return undefined;
  try {
    const claims: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const sub = typeof claims === 'object' && claims !== null ? (claims as { sub?: unknown }).sub : undefined;
    return typeof sub === 'string' && sub.length > 0 ? sub : undefined;
  } catch {
    return undefined;
  }
}

export function describeCall(client: string, operation: string, args: readonly unknown[]): CallInfo {
  const key = args.find((a): a is string => typeof a === 'string' && !isCredential(a) && !a.startsWith('00-'));
  const credential = args.find(isCredential) as string | undefined;
  return {
    client,
    operation,
    key: key ?? operation,
    customer: credential === undefined ? undefined : customerOf(credential),
    payload: args.find((a) => typeof a === 'object' && a !== null && !isTrace(a)),
  };
}

/** True when `value` contains everything `pattern` names: equal scalars, objects with at least the pattern's properties, arrays of the same length element by element. */
export function contains(pattern: unknown, value: unknown): boolean {
  if (Array.isArray(pattern))
    return Array.isArray(value) && value.length === pattern.length && pattern.every((p, i) => contains(p, value[i]));
  if (typeof pattern === 'object' && pattern !== null) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    return Object.entries(pattern).every(([k, p]) => contains(p, (value as Record<string, unknown>)[k]));
  }
  return pattern === value;
}

export function matches(match: Match, call: CallInfo): boolean {
  if (match.client !== undefined && match.client !== call.client) return false;
  if (match.operation !== undefined && match.operation !== call.operation) return false;
  if (match.customer !== undefined && match.customer !== call.customer) return false;
  if (match.key !== undefined && match.key !== call.key) return false;
  if ('payload' in match && !contains(match.payload, call.payload)) return false;
  return true;
}
