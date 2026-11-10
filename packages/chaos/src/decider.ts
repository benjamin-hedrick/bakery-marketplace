import { createHash } from 'node:crypto';

/**
 * Whether a fault applies is a pure function of (seed, layer, fault, operation key), never of call order or timing (ADR-0024). The number is
 * SHA-256 over `"{seed}|{layer}|{fault}|{key}"` (UTF-8), the first 8 bytes read big-endian as an unsigned integer, the low 11 bits dropped and the
 * rest divided by 2^53: a value in [0, 1) exactly. The C# library gives the same numbers; `chaos/test-vectors.json` is the proof both suites check.
 */
export function unit(seed: bigint | number, layer: string, fault: string, key: string): number {
  const digest = createHash('sha256').update(`${seed}|${layer}|${fault}|${key}`, 'utf8').digest();
  return Number(digest.readBigUInt64BE(0) >> 11n) / 9007199254740992;
}

/** True when the fault applies at this rate (0 never, 1 always). */
export const applies = (seed: bigint | number, layer: string, fault: string, key: string, rate: number): boolean =>
  rate > 0 && unit(seed, layer, fault, key) < rate;
