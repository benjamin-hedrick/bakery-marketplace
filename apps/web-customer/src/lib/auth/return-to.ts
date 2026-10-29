/**
 * Where to send the user after login. It travels through the browser (and the issuer's redirect), so it is treated as untrusted: only a
 * path inside this app is accepted, anything else is the home page. This is what stops a crafted login link from bouncing someone
 * to another site. The callback page itself is never a destination, so a login cannot loop.
 */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return '/';
  if (/^\/auth\/callback(?:[/?#]|$)/.test(value)) return '/';
  return value;
}
