# syntax=docker/dockerfile:1
#
# Multi-stage build for account-service.
#
# The point of the stages is that build tools, dev dependencies and source code
# never reach the shipped image: the final layer holds a pruned node_modules,
# compiled JS, and the Prisma schema needed to run migrations. Smaller image,
# faster pulls, and a much smaller attack surface.

# --------------------------------------------------------------------------
# base - shared foundation, pinned to the Node version in .nvmrc
# --------------------------------------------------------------------------
FROM node:24-alpine AS base
WORKDIR /app

# Node was never designed to be PID 1: it does not reap orphaned children and
# does not forward signals. dumb-init does both, so `docker stop` delivers
# SIGTERM to the app and shutdown hooks actually run instead of timing out.
RUN apk add --no-cache dumb-init


# --------------------------------------------------------------------------
# deps - complete dependency tree, used only to compile
# --------------------------------------------------------------------------
FROM base AS deps

# Copy manifests first. This layer is cached until a dependency actually
# changes, so editing source code does not trigger a reinstall.
COPY package.json package-lock.json ./

# `npm ci`, never `npm install`: it installs exactly what the lockfile pins and
# fails if the two disagree. Reproducible builds are the whole point.
RUN npm ci


# --------------------------------------------------------------------------
# build - typecheck, compile to dist/, generate the Prisma client
# --------------------------------------------------------------------------
FROM base AS build

COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate && npm run build


# --------------------------------------------------------------------------
# prod-deps - runtime dependencies only
# --------------------------------------------------------------------------
FROM base AS prod-deps

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The Prisma client is generated code, so it has to be regenerated inside the
# pruned tree - it is not something `npm ci` can fetch.
COPY prisma ./prisma
RUN npx prisma generate


# --------------------------------------------------------------------------
# runner - the only stage that ships
# --------------------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production
ENV ACCOUNT_SERVICE_PORT=3006

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

# `prisma migrate deploy` needs the schema and the migrations directory at run
# time; it does not need the source.
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node package.json ./
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Run as an unprivileged user. If the process is ever compromised, the attacker
# lands as `node`, not root. The node images ship this user already.
USER node

EXPOSE 3006

# No HEALTHCHECK here on purpose: docker-compose.yml owns the health probes so
# there is a single source of truth, and so the same image can be handed to
# Kubernetes, which defines its own probes.
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
