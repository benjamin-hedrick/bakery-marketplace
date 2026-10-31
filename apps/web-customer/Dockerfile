# Customer web app image (WI-DEP-001, N-10). Build context is the repository root (Relay reads the BFF schema from services/graphql-bff):
#   docker build -f apps/web-customer/Dockerfile -t bakery-web .
# One image for every environment: the BFF address is the GRAPHQL_URL the container is started with (the /api/graphql route and server
# rendering read it on each request), not a build argument (ADR-0020, register item 101).
FROM node:24-slim AS build
WORKDIR /repo
COPY apps/web-customer/package.json apps/web-customer/package-lock.json apps/web-customer/
RUN cd apps/web-customer && npm ci
COPY apps/web-customer apps/web-customer
COPY services/graphql-bff/schema services/graphql-bff/schema
RUN cd apps/web-customer && node scripts/ensure-artifact-dir.mjs && node node_modules/relay-compiler/cli.js && node node_modules/next/dist/bin/next build && npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /repo/apps/web-customer
COPY --from=build /repo/apps/web-customer ./
COPY --from=build /repo/services/graphql-bff/schema /repo/services/graphql-bff/schema
EXPOSE 3000
USER node
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
