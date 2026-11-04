// Who is signed in, for display only (WI-MOB-002). The mock issuer puts the user's name in the token's `name` claim; a real issuer's token may carry one too.
// The app reads it to say "Signed in as ..." and for nothing else: **the signature is not checked here and nothing may be decided from this value**.
// Every service validates the token itself (ADR-0006), so a forged name can only mislead the person holding the device.

const MAX_LENGTH = 80;

/** Control characters and the Unicode line and paragraph separators: never shown in a name. */
const isControl = (cp: number) => cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f) || cp === 0x2028 || cp === 0x2029;

function decodeBase64Url(part: string): string | null {
  try {
    const b64 = part.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    // The payload is UTF-8; atob gives one character per byte.
    return decodeURIComponent(Array.from(binary, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
  } catch {
    return null;
  }
}

/**
 * The name in a JWT's payload, trimmed, without control characters and at most 80 characters, or null when the token is not a JWT, has no usable `name`,
 * or the name is empty after cleaning.
 */
export function displayNameFromToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const json = decodeBase64Url(parts[1]!);
  if (json === null) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const name = (payload as Record<string, unknown>).name;
  if (typeof name !== 'string') return null;
  const cleaned = Array.from(name, (ch) => (isControl(ch.codePointAt(0)!) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '') return null;
  return Array.from(cleaned).slice(0, MAX_LENGTH).join('');
}
