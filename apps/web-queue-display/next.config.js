/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // skeleton-smoke.mjs sets NEXT_DIST_DIR so its build cannot overwrite the `.next` that the mock-backed `npm run test:e2e` uses.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  compiler: {
    relay: { src: './src', artifactDirectory: './src/__generated__', language: 'typescript' },
  },
  // The browser talks to the GraphQL BFF through the same origin, at /api/graphql (ADR-0013). That is an API route (src/pages/api/graphql.ts),
  // not a rewrite, because a rewrite's destination is fixed in the build and the image must run in every environment (ADR-0020).
};
