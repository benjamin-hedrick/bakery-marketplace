# GraphQL BFF image (WI-DEP-001, N-10). Build context is the repository root:
#   docker build -f services/graphql-bff/Dockerfile -t bakery-bff .
# Node 24 runs the TypeScript sources directly (type stripping), so there is no build step; only production dependencies are installed.
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY services/graphql-bff/package.json services/graphql-bff/package-lock.json ./
RUN npm ci --omit=dev
COPY services/graphql-bff/src ./src
COPY services/graphql-bff/schema ./schema
ENV BFF_PORT=4100
EXPOSE 4100
USER node
CMD ["node", "src/main.ts"]
