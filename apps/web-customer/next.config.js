const path = require('node:path'); // eslint-disable-line @typescript-eslint/no-require-imports

/**
 * Browser hardening headers (register item 134, WI-SEC-005). Set on every response, pages and API routes. The same block is in both apps; a test in
 * each checks it.
 * - frame-ancestors 'none' (and X-Frame-Options for old browsers): no other site can put the app in a frame, so no one can be tricked into pressing a
 *   button in it (the vendor's Accept and Decline).
 * - The rest of the CSP limits where scripts, requests, forms and objects may come from. script-src keeps 'unsafe-inline' because Next.js writes inline
 *   scripts (its page data and bootstrap) that have no fixed hash; moving to nonces needs a middleware and dynamic rendering of every page, which is a
 *   larger change. So this CSP stops a script or request going to another origin, but does not stop an injected inline script. 'unsafe-eval' is added
 *   only by `next dev`.
 * - Strict-Transport-Security is not set here: locally the apps run over plain HTTP. It belongs on the HTTPS ingress of a deployed environment.
 */
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

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false, // no `X-Powered-By: Next.js`: a scan reports it as information about the stack
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // The shared packages ship TypeScript source (ADR-0019 session; WI-MOB-001 customer cart and wording).
  transpilePackages: ['@bakery/web-session', '@bakery/customer-core'],
  // The package lives outside this folder (packages/*), and Turbopack only reads files under its root: the repository.
  turbopack: { root: path.join(__dirname, '..', '..') },
  // skeleton-smoke.mjs sets NEXT_DIST_DIR so its build cannot overwrite the `.next` that the mock-backed `npm run test:e2e` uses.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  compiler: {
    relay: { src: './src', artifactDirectory: './src/__generated__', language: 'typescript' },
  },
  // The browser talks to the GraphQL BFF through the same origin, at /api/graphql (ADR-0013). That is an API route (src/pages/api/graphql.ts),
  // not a rewrite, because a rewrite's destination is fixed in the build and the image must run in every environment (ADR-0020).
};
