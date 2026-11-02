/**
 * What the page may show about the logged-in user. These claims are read from the token WITHOUT verifying its signature, so they are for
 * display and for knowing when the login ends, never for deciding what the user may do: every service validates the token itself (ADR-0006).
 */
export interface SessionClaims {
  subject: string;
  name: string | undefined;
  email: string | undefined;
  roles: string[];
  /** When the token expires, in milliseconds since the epoch. */
  expiresAt: number;
}

function decodePayload(segment: string): unknown {
  const padded = segment
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(segment.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

const text = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);

/** The claims of a JWT, or null when it is not a three-part token with a subject and an expiry. */
export function parseClaims(token: string): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let payload: Record<string, unknown>;
  try {
    const decoded = decodePayload(parts[1]!);
    if (typeof decoded !== 'object' || decoded === null) return null;
    payload = decoded as Record<string, unknown>;
  } catch {
    return null;
  }
  const subject = text(payload.sub);
  const exp = payload.exp;
  if (subject === undefined || typeof exp !== 'number' || !Number.isFinite(exp)) return null;
  const roles = (Array.isArray(payload.roles) ? payload.roles : [payload.roles]).filter(
    (r): r is string => typeof r === 'string',
  );
  return { subject, name: text(payload.name), email: text(payload.email), roles, expiresAt: exp * 1000 };
}
