# syntax=docker/dockerfile:1
# Local adapter only; in AWS the handlers ship as a Lambda zip. Build context: app/. The bundle is plain JavaScript, so it is built on the host
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
RUN pnpm install --frozen-lockfile
COPY scripts scripts
COPY packages packages
COPY services/write-api services/write-api
RUN pnpm --filter @celestiea/write-api build

FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /app
ENV NODE_ENV=production NODE_OPTIONS=--enable-source-maps
COPY --from=build /app/services/write-api/dist ./dist

EXPOSE 3001
CMD ["dist/local-main.mjs"]
