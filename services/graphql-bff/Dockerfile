# GraphQL BFF image (WI-DEP-001, N-10). Build context is the repository root:
#   docker build -f services/graphql-bff/Dockerfile -t bakery-bff .
# Node 24 runs the TypeScript sources directly (type stripping), so there is no build step; only production dependencies are installed.
# The chaos package (ADR-0024) is linked into the BFF (file:../../packages/chaos) and has no dependencies, so it is copied to the same relative path.
# chaos/scenarios holds the scenario files a named CHAOS_SCENARIO is read from; nothing happens unless CHAOS_ENABLED is set, and the process refuses
# to start with it set outside local and dev (DEPLOYMENT_ENVIRONMENT).
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /repo
COPY packages/chaos packages/chaos
COPY chaos/scenarios chaos/scenarios
COPY services/graphql-bff/package.json services/graphql-bff/package-lock.json services/graphql-bff/
RUN cd services/graphql-bff && npm ci --omit=dev
COPY services/graphql-bff/src services/graphql-bff/src
COPY services/graphql-bff/schema services/graphql-bff/schema
WORKDIR /repo/services/graphql-bff
ENV BFF_PORT=4100
EXPOSE 4100
USER node
CMD ["node", "src/main.ts"]
