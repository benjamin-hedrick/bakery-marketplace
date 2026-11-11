# Customer web app image (WI-DEP-001, N-10). Build context is the repository root (Relay reads the BFF schema from services/graphql-bff):
#   docker build -f apps/web-customer/Dockerfile -t bakery-web .
# One image for every environment: the BFF address is the GRAPHQL_URL the container is started with (the /api/graphql route and server
# rendering read it on each request), not a build argument (ADR-0020, register item 101).
FROM node:24-slim AS build
WORKDIR /repo
# The shared session package (ADR-0019) is linked into the app (file:../../packages/web-session) and holds the Redis client, so it is installed
# first and kept at the same relative path in the final image.
# It links the chaos package (ADR-0024, no dependencies), which must exist when it is installed.
COPY packages/chaos packages/chaos
COPY packages/web-session/package.json packages/web-session/package-lock.json packages/web-session/
RUN cd packages/web-session && npm ci
COPY packages/web-session packages/web-session
# The shared customer logic (WI-MOB-001) is plain TypeScript with no dependencies at run time.
COPY packages/customer-core packages/customer-core
COPY apps/web-customer/package.json apps/web-customer/package-lock.json apps/web-customer/
RUN cd apps/web-customer && npm ci
COPY apps/web-customer apps/web-customer
COPY services/graphql-bff/schema services/graphql-bff/schema
RUN cd apps/web-customer && node scripts/ensure-artifact-dir.mjs && node node_modules/relay-compiler/cli.js && node node_modules/next/dist/bin/next build && npm prune --omit=dev && cd ../../packages/web-session && npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /repo/apps/web-customer
COPY --from=build /repo/apps/web-customer ./
COPY --from=build /repo/packages/web-session /repo/packages/web-session
COPY --from=build /repo/packages/chaos /repo/packages/chaos
# The scenario files a named CHAOS_SCENARIO is read from; nothing happens unless CHAOS_ENABLED is set, and the process refuses it outside local and dev.
COPY chaos/scenarios /repo/chaos/scenarios
COPY --from=build /repo/packages/customer-core /repo/packages/customer-core
COPY --from=build /repo/services/graphql-bff/schema /repo/services/graphql-bff/schema
EXPOSE 3000
USER node
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
