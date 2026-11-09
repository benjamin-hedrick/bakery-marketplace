// Browser hardening headers of the two web apps (register item 134, WI-SEC-005), written once. Each app's next.config.js uses `headers` from here; a test in
// each app checks what the browser receives. Plain CommonJS and no dependencies, because next.config.js is read by Node before anything is compiled.
//
// - frame-ancestors 'none' (and X-Frame-Options for old browsers): no other site can put the app in a frame, so no one can be tricked into pressing a
//   button in it (the vendor's Accept and Decline).
// - The rest of the CSP limits where scripts, requests, forms and objects may come from. script-src keeps 'unsafe-inline' because Next.js writes inline
//   scripts (its page data and bootstrap) that have no fixed hash; moving to nonces needs a middleware and dynamic rendering of every page, which is a
//   larger change. So this CSP stops a script or request going to another origin, but does not stop an injected inline script. 'unsafe-eval' is added
//   only by `next dev`.
// - Strict-Transport-Security is not set here: locally the apps run over plain HTTP. It belongs on the HTTPS ingress of a deployed environment.

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  // Not shared with other origins: no other site may open the app in a window it can script, or embed its responses.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
];

/** The `headers()` of a Next.js config: the security headers on everything, and no cache on any API route. */
async function headers() {
  return [
    { source: '/:path*', headers: securityHeaders },
    // Register 159, ADR-0014 layer 3: nothing an API route answers may be kept by any cache. This is the default for every /api response, including the
    // ones the session proxy writes itself (an origin refusal, 413, 502); a handler that sets its own policy (the proxy passes the BFF's through, the
    // stream says `no-store, no-transform`) keeps it.
    { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
  ];
}

module.exports = { headers };
