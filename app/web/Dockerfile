# syntax=docker/dockerfile:1
# Development server for docker compose. Production serves the `vite build` output from
# S3 behind CloudFront, so there is no runtime image for the UI. Build context: app/.
FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY web/package.json web/
RUN pnpm install --frozen-lockfile --filter @celestiea/web
COPY web web
WORKDIR /app/web
CMD ["pnpm", "dev"]
