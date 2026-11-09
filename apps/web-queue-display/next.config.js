const path = require('node:path'); // eslint-disable-line @typescript-eslint/no-require-imports

// Browser hardening headers and the no-store rule for API routes are written once, in the session package (register items 134 and 159).
const { headers } = require('@bakery/web-session/next-headers'); // eslint-disable-line @typescript-eslint/no-require-imports

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false, // no `X-Powered-By: Next.js`: a scan reports it as information about the stack
  headers,
  // The shared session package ships TypeScript source (ADR-0019).
  transpilePackages: ['@bakery/web-session'],
  // The package lives outside this folder (packages/web-session), and Turbopack only reads files under its root: the repository.
  turbopack: { root: path.join(__dirname, '..', '..') },
  // skeleton-smoke.mjs sets NEXT_DIST_DIR so its build cannot overwrite the `.next` that the mock-backed `npm run test:e2e` uses.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  compiler: {
    relay: { src: './src', artifactDirectory: './src/__generated__', language: 'typescript' },
  },
  // The browser talks to the GraphQL BFF through the same origin, at /api/graphql (ADR-0013). That is an API route (src/pages/api/graphql.ts),
  // not a rewrite, because a rewrite's destination is fixed in the build and the image must run in every environment (ADR-0020).
};
