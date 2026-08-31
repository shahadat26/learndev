# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 - deps: install the full dependency tree once so it can be cached.
# "npm ci" (never "npm install") installs exactly what package-lock.json pins,
# which is what makes an image build reproducible.
# ---------------------------------------------------------------------------
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2 - builder: compile the Next.js app.
# NEXT_PUBLIC_* values are inlined into the client bundle here, at BUILD time,
# which is why the site URL is a build argument and not a runtime variable.
# ---------------------------------------------------------------------------
FROM node:26-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_SITE_URL=http://localhost
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3 - runner: ship only the standalone server output.
# No source, no devDependencies, no build toolchain.
# ---------------------------------------------------------------------------
FROM node:26-alpine AS runner
RUN apk add --no-cache dumb-init
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3005
ENV HOSTNAME=0.0.0.0

# "output: standalone" produces server.js plus a pruned node_modules tree.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Never run application code as root inside a container.
USER node

EXPOSE 3005

# dumb-init is PID 1 so SIGTERM reaches node and reaping works properly.
ENTRYPOINT ["dumb-init", "--"]

# Healthchecks live in docker-compose.yml, not here, so compose stays the single
# source of truth for how the service is probed.
CMD ["node", "server.js"]
