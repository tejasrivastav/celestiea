# syntax=docker/dockerfile:1
# Build context: app/. The bundle is plain JavaScript, so it is built on the host
# platform and only the runtime stage is per-architecture (no emulation for arm64).
FROM --platform=$BUILDPLATFORM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/domain/package.json packages/domain/
COPY packages/db/package.json packages/db/
COPY packages/seed/package.json packages/seed/
COPY services/read-api/package.json services/read-api/
COPY services/write-api/package.json services/write-api/
COPY services/migrator/package.json services/migrator/
COPY services/kill-switch/package.json services/kill-switch/
RUN pnpm install --frozen-lockfile
COPY scripts scripts
COPY packages packages
COPY services/read-api services/read-api
RUN pnpm --filter @celestiea/read-api build
# Mercurius serves GraphiQL from <its dir>/../static, which in the bundle is /app/static.
RUN cp -rL services/read-api/node_modules/mercurius/static /app/graphiql-static

FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /app
ADD --chmod=444 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/rds-ca.pem
ENV NODE_ENV=production NODE_EXTRA_CA_CERTS=/app/rds-ca.pem NODE_OPTIONS=--enable-source-maps
COPY --from=build /app/services/read-api/dist ./dist
COPY --from=build /app/graphiql-static ./static

EXPOSE 3000
CMD ["dist/main.mjs"]
