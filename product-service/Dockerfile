# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# product-service - multi-stage build.
#
# Stages exist so the final image carries only what is needed to RUN the app:
# no TypeScript compiler, no test framework, no source. Smaller image = faster
# pulls, smaller attack surface, fewer CVEs to triage.
# ---------------------------------------------------------------------------

# ---- deps: full dependency tree, used only to compile -----------------------
FROM node:24-alpine AS deps
WORKDIR /app
# `npm ci` (never `npm install`) installs exactly the lockfile, so the image is
# reproducible and a build can never silently pick up a new transitive version.
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile TypeScript and generate the Prisma client ---------------
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ---- prod-deps: runtime dependencies only -----------------------------------
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# The Prisma client is generated code: it has to be regenerated against this
# pruned node_modules, not copied from the build stage.
COPY prisma ./prisma
RUN npx prisma generate

# ---- runner: the shipped image ----------------------------------------------
FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# dumb-init becomes PID 1: it reaps zombies and forwards SIGTERM/SIGINT to the
# app, so `docker stop` triggers Nest's shutdown hooks instead of a SIGKILL.
RUN apk add --no-cache dumb-init

COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Never run as root: a container escape should not start with uid 0. The
# node:alpine image ships an unprivileged `node` user for exactly this.
USER node

EXPOSE 3007

# No HEALTHCHECK here on purpose - docker-compose.yml owns the healthchecks so
# there is a single source of truth for how this service is probed.
# The entrypoint is named by absolute path, not by bare name: the exec form does
# no shell processing, so resolving "docker-entrypoint.sh" would depend entirely
# on PATH containing /usr/local/bin. Spelling it out cannot break. Same form as
# account-service.
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
