# syntax=docker/dockerfile:1
# One Dockerfile, two targets: `dev` (used by docker compose) and `prod` (the single service that goes to Railway).

FROM node:26-bookworm-slim AS base
RUN npm install -g pnpm@12.16.1
WORKDIR /app

# Only the manifests first, so the install layer is reused until a dependency changes.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/rules-core/package.json packages/rules-core/
COPY packages/rules-srd/package.json packages/rules-srd/
COPY packages/content/package.json packages/content/
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/

FROM manifests AS deps
RUN pnpm install --frozen-lockfile

FROM manifests AS prod-deps
# Production dependencies of the server and the workspace packages it uses; the client is built, not shipped.
RUN pnpm install --frozen-lockfile --prod --filter @phoenix/server...

# ---- dev: sources come from bind mounts (see docker-compose.yml) ----
FROM deps AS dev
COPY . .
EXPOSE 3000 5173
CMD ["pnpm", "--filter", "@phoenix/server", "dev"]

# ---- build the client ----
FROM deps AS build
COPY . .
RUN pnpm --filter @phoenix/client build

# ---- prod: the server also serves the built client ----
FROM base AS prod
ENV NODE_ENV=production \
    PORT=3000 \
    STATIC_DIR=/app/apps/client/dist \
    STORAGE_PATH=/data/images
COPY --from=prod-deps /app ./
COPY packages ./packages
COPY apps/server ./apps/server
COPY --from=build /app/apps/client/dist ./apps/client/dist
# The folder of uploaded pictures is a volume in production: it must exist and belong to the app user.
RUN mkdir -p /data/images && chown -R node:node /app /data
VOLUME ["/data/images"]
USER node
WORKDIR /app/apps/server
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/main.ts"]
