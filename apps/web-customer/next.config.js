/** @type {import('next').NextConfig} */
const graphqlUrl = process.env.GRAPHQL_URL ?? 'http://localhost:4000/graphql';

module.exports = {
  reactStrictMode: true,
  compiler: {
    relay: { src: './src', artifactDirectory: './src/__generated__', language: 'typescript' },
  },
  // The browser talks to the GraphQL BFF through the same origin; the BFF is the only API entry point (ADR-0013).
  async rewrites() {
    return [{ source: '/api/graphql', destination: graphqlUrl }];
  },
};
