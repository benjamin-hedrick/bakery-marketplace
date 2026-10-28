import { randomBytes } from 'node:crypto';

// W3C Trace Context (ADR-0016): `traceparent` is the only propagated mechanism.
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

export interface TraceContext {
  traceId: string;
  /** Span id of this service's span; sent downstream as the parent id. */
  spanId: string;
  flags: string;
  /** Span id of the caller's span, when an inbound traceparent was continued; the parent of this service's span. */
  parentSpanId?: string;
  /** True when an inbound, valid traceparent was continued rather than a new trace started. */
  continued: boolean;
}

const hex = (bytes: number) => randomBytes(bytes).toString('hex');
const isZero = (s: string) => /^0+$/.test(s);

/** Continues a valid inbound traceparent with a new span id, otherwise starts a new trace. Malformed input is ignored, never echoed. */
export function startTrace(inbound: string | undefined): TraceContext {
  const m = inbound ? TRACEPARENT.exec(inbound.trim()) : null;
  if (m && !isZero(m[1]!) && !isZero(m[2]!)) {
    return { traceId: m[1]!, spanId: hex(8), parentSpanId: m[2]!, flags: m[3]!, continued: true };
  }
  return { traceId: hex(16), spanId: hex(8), flags: '01', continued: false };
}

export const toTraceparent = (t: TraceContext) => `00-${t.traceId}-${t.spanId}-${t.flags}`;
