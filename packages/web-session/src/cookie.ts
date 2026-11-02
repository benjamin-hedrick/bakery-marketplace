// Cookies for the session (ADR-0019): HttpOnly always, SameSite=Lax, Path=/, no Domain; Secure (and the `__Host-` name) except on loopback HTTP.

export interface CookieOptions {
  secure: boolean;
  /** Seconds the browser keeps it. 0 deletes it. */
  maxAgeSeconds: number;
}

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value) && value !== '')
    throw new Error('A cookie value here is an opaque id of url-safe characters.');
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
  ];
  if (options.maxAgeSeconds <= 0) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie(name: string, secure: boolean): string {
  return serializeCookie(name, '', { secure, maxAgeSeconds: 0 });
}

/** The value of one cookie from a `Cookie` request header, or undefined. The first occurrence wins. */
export function readCookie(header: string | string[] | undefined, name: string): string | undefined {
  const text = Array.isArray(header) ? header.join('; ') : header;
  if (!text) return undefined;
  for (const part of text.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}
