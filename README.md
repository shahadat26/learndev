# learndev — an e-commerce microservices DevOps lab

[![CI](https://github.com/OWNER/learndev/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/learndev/actions/workflows/ci.yml)

<!-- Replace OWNER above with your GitHub username after you push your fork.
     A badge is served per repository, so until then it renders as "not found". -->

A small, complete, *production-shaped* system you can read in an afternoon and
then spend six months operating properly.

Two NestJS APIs, a Next.js storefront, PostgreSQL, and Traefik in front of all
of it. Every convention here — 12-factor config, healthchecks, migrations,
structured logs, non-root containers, tests that run offline — is the one you
would use for real. The point is not the shop. The point is that the shop is a
realistic thing to put a CI pipeline, a registry, a cluster and a dashboard
around, one stage at a time. See **[docs/devops-roadmap.md](docs/devops-roadmap.md)**.

```
                         ┌───────────┐
                         │  Browser  │    http://localhost  (port 80 - the only open port)
                         └─────┬─────┘
                               ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │  traefik v3.3                                     network: edge   │
   │  /api/auth , /api/users            ─strip /api─▶   account:3006   │
   │  /api/products , /api/categories   ─strip /api─▶   product:3007   │
   │  /    (priority 1, catch-all)      ────────────▶   frontend:3005  │
   └─────┬─────────────────────┬────────────────────────┬──────────────┘
         ▼                     ▼                        ▼
   ┌───────────┐      ┌─────────────────┐      ┌─────────────────┐
   │  frontend │      │ account-service │      │ product-service │
   │  Next 15  │      │    NestJS 11    │      │    NestJS 11    │
   │  React 19 │      │      :3001      │      │      :3002      │
   │   :3000   │      │  /auth  /users  │      │  /products      │
   │           │      │  /health        │      │  /categories    │
   └─────┬─────┘      └────┬──────┬─────┘      └────┬──────┬─────┘
         │                 ▲      │                 ▲      │
         ├─────────────────┘      │                 │      │
         └────────────────────────┼─────────────────┘      │
    server-side calls only;       │                        │
    no JWT in the browser         │   network: backend     │
                                  │      (internal)        │
                                  ▼                        ▼
                      ┌──────────────────────────────────────────┐
                      │             postgres 17-alpine           │
                      │     account_db          product_db       │
                      │             volume: pgdata               │
                      └──────────────────────────────────────────┘
```

`frontend` is not on `backend`. `postgres` is not on `edge`. Only Traefik
publishes a host port. Full walkthrough in
**[docs/architecture.md](docs/architecture.md)**.

---

## Prerequisites

| Tool                    | Version         | Needed for                       |
| ----------------------- | --------------- | -------------------------------- |
| Docker Engine / Desktop | **28.x**        | everything                       |
| Docker Compose plugin   | **v2** (`docker compose`, not `docker-compose`) | everything |
| Node.js                 | **24** (see `.nvmrc`) | running a service outside Docker |
| npm                     | **11.x**        | ditto                            |
| Git                     | any recent      | cloning                          |
| GNU Make                | optional        | the `make` shortcuts             |

Check in one line:

```bash
docker --version && docker compose version && node --version && npm --version
```

**Windows:** `make` is *not* installed by default, and the `Makefile` here is
written for a POSIX shell — so run it from **Git Bash** or **WSL**, not `cmd` or
PowerShell. You never actually need it: every target below is listed with its
raw `docker compose` equivalent, and those work in any shell.

**Free ports:** the base stack needs **80** and **8080**. The dev override
additionally needs **3000**, **3001**, **3002** and **5432**.

---

## Quick start

Three commands:

```bash
git clone <your-fork-url> learndev && cd learndev
cp .env.example .env                    # PowerShell: Copy-Item .env.example .env
docker compose up -d --build --wait     # or: make up
```

**On Windows, port 80 is very often already taken** — IIS or the `http.sys`
"World Wide Web Publishing" service is the usual owner, and this is the single
most likely way for that third command to fail. If you get
`Bind for 0.0.0.0:80 failed: port is already allocated`, go straight to the
first entry under [Troubleshooting](#troubleshooting) below: it shows how to
find the process holding the port and how to move Traefik to another one.

`--wait` is the interesting flag: it blocks until **every** healthcheck passes
and exits non-zero if one never does, so the command returns only when the stack
is genuinely ready. First build pulls base images and compiles three projects —
expect a few minutes. Two `[TypeError: fetch failed]` traces during the frontend
build are expected; see Troubleshooting.

Watch it happen, or look afterwards:

```bash
docker compose ps          # with --wait, every service already reads (healthy)
docker compose logs -f     # or: make logs
```

Then seed the databases (idempotent — run it as often as you like):

```bash
docker compose exec account-service npm run prisma:seed
docker compose exec product-service npm run prisma:seed
# or: make seed
```

Prove it end to end — liveness, Traefik's routing, the `/api` strip, the
migrations and the seed, in one command:

```bash
make smoke
```

(That one really does need `make`, so Git Bash or WSL on Windows. It is a
handful of `curl` calls — read the target if you would rather run them yourself.)

Open <http://localhost>. Stop with `docker compose down` (`make down`); your
data survives in the `pgdata` volume.

---

## URLs

With the base stack (`docker compose up`):

| URL                                            | What                                          |
| ---------------------------------------------- | --------------------------------------------- |
| <http://localhost>                             | The shop (Next.js, through Traefik)           |
| <http://localhost/products>                    | Product list, search + pagination             |
| <http://localhost/login> · `/register` · `/profile` | Auth pages (`/profile` is guarded)       |
| <http://localhost/api/products>                | Catalogue API through the edge router         |
| <http://localhost/api/categories>              | Categories API                                |
| <http://localhost/api/auth/login>              | Login endpoint (`POST`)                       |
| <http://localhost/api/users/profile>           | Current user (`GET`, bearer)                  |
| <http://localhost:8080>                        | **Traefik dashboard — DEV ONLY, no auth**     |

With the dev override (`make up-dev`) the services are also reachable directly,
which is the only way to get at Swagger:

| URL                              | What                                        |
| -------------------------------- | ------------------------------------------- |
| <http://localhost:3001/docs>     | account-service Swagger UI                  |
| <http://localhost:3002/docs>     | product-service Swagger UI                  |
| <http://localhost:3001/health>   | Liveness (no database touched)              |
| <http://localhost:3001/health/ready> | Readiness (pings PostgreSQL)            |
| <http://localhost:3002/health>   | · `/health/ready`                           |
| <http://localhost:3000>          | Next.js directly, bypassing Traefik         |
| `localhost:5432`                 | PostgreSQL, for psql / DBeaver / TablePlus  |

> ⚠️ **The Traefik dashboard on :8080 is development only.** `api.insecure: true`
> in `infra/traefik/traefik.yml` serves the API and dashboard with **no
> authentication** — anyone who can reach that port can read your entire routing
> table. Before this touches a shared network: set `insecure: false`, put the
> dashboard behind a router with basic-auth/forward-auth and TLS, or stop
> publishing 8080 in `docker-compose.yml`. Swagger is likewise mounted only when
> `NODE_ENV !== production`, and the base stack hardcodes `NODE_ENV=production`
> on all three app services — that is why `/docs` exists solely under the dev
> override, no matter what your `.env` says.

Note the asymmetry: through Traefik you call `/api/products`; the service itself
serves `/products`. Traefik strips `/api` before forwarding, which is why
neither Nest app sets a global prefix.

---

## Seeded credentials

Created by `make seed` (upserts only, so re-seeding never duplicates):

| Role      | Email              | Password    |
| --------- | ------------------ | ----------- |
| **ADMIN** | `admin@shop.local` | `Admin123!` |
| USER      | `user@shop.local`  | `User123!`  |

The admin account is the only one that can `POST/PATCH/DELETE /api/products` and
`POST /api/categories`. The product seed adds 3 categories and 8 products.

Try it from the shell. This block is **bash + `curl` + `jq`** — on Windows run it
in Git Bash or WSL (`jq` is not installed on a stock Windows box: `winget install
jqlang.jq`). A PowerShell translation follows it.

```bash
# log in and keep the access token
TOKEN=$(curl -s -X POST http://localhost/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@shop.local","password":"Admin123!"}' | jq -r .accessToken)

# public read
curl -s 'http://localhost/api/products?page=1&limit=5' | jq

# admin write - a product must reference an existing category, so grab one first
CATEGORY_ID=$(curl -s http://localhost/api/categories | jq -r '.[0].id')

curl -s -X POST http://localhost/api/products \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"sku":"TEST-MUG-01","name":"Test mug","description":"A mug",
       "priceCents":1299,"currency":"USD","categoryId":"'"$CATEGORY_ID"'"}' | jq
```

The same thing in PowerShell, with no `jq` — `Invoke-RestMethod` parses the JSON
into objects for you:

```powershell
# log in and keep the access token
$login = Invoke-RestMethod -Method Post http://localhost/api/auth/login `
  -ContentType 'application/json' `
  -Body '{"email":"admin@shop.local","password":"Admin123!"}'
$token = $login.accessToken

# public read
Invoke-RestMethod 'http://localhost/api/products?page=1&limit=5' | ConvertTo-Json -Depth 5

# admin write - a product must reference an existing category, so grab one first
$categoryId = (Invoke-RestMethod http://localhost/api/categories)[0].id

$body = @{
  sku        = 'TEST-MUG-01'
  name       = 'Test mug'
  description = 'A mug'
  priceCents = 1299
  currency   = 'USD'
  categoryId = $categoryId
} | ConvertTo-Json

Invoke-RestMethod -Method Post http://localhost/api/products `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType 'application/json' -Body $body
```

One PowerShell wrinkle worth knowing before the next paragraph asks you to
trigger errors on purpose: `Invoke-RestMethod` *throws* on a 4xx instead of
printing the response, so the API's message is hidden. Catch it to read it:

```powershell
try   { Invoke-RestMethod -Method Post http://localhost/api/products -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body '{}' }
catch { $_.ErrorDetails.Message }
```

`sku` and `categoryId` are required (`sku` uppercase alphanumerics and hyphens,
`categoryId` a UUID that exists). Leave either out and the global
`ValidationPipe` answers `400` with the class-validator messages; run the same
command twice and the second one is a `409`, because `sku` is unique. Both are
worth triggering once on purpose — that is what the error contract looks like.

Every list endpoint returns the same envelope:

```json
{ "data": [], "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 } }
```

Money is always `priceCents` (integer) plus `currency` — never a float. A `user`
object never contains a password hash.

---

## Development

### Option A — containers with hot reload (recommended)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
# or: make up-dev
```

The override adds host ports 3000/3001/3002/5432, forces
`NODE_ENV=development` and `LOG_LEVEL=debug`, bind-mounts each project's source,
and runs `start:dev` / `next dev`, so saving a file reloads the process inside
the container.

The production images install with `--omit=dev`, so the dev containers run
`npm install` on first start to pull the toolchain (Nest CLI, ts-node, Next).
**The first boot is slow** — a few minutes. After that `node_modules` lives in a
named volume and is reused. Wipe it with
`docker volume rm learndev_account_service_node_modules` if it ever gets stale.

Always pass **both** files, including on the way down:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

And run a `down` **before switching modes**, in either direction — base stack to
dev override or back. Compose reuses whatever it finds: it recreates a container
whose definition changed, but it will *not* recreate an existing **network** to
apply a changed option. Starting each mode from nothing is one command and
removes a whole class of "it worked yesterday" from your afternoon.

### Option B — one service on the host, the rest in Docker

Handy when you want a debugger attached.

```bash
# 1. Bring up just the dependencies (with host ports)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
```

**account-service**

```bash
cd account-service
cp .env.example .env          # points at localhost:5432, not the compose DNS name
npm ci
npx prisma generate
npx prisma migrate deploy     # applies prisma/migrations/0_init
npm run prisma:seed
npm run start:dev             # http://localhost:3001  · Swagger /docs
```

**product-service**

```bash
cd product-service
cp .env.example .env
npm ci
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev             # http://localhost:3002  · Swagger /docs
```

**frontend**

```bash
cd frontend
cp .env.example .env          # API_ACCOUNT_URL=http://localhost:3001 etc.
npm ci
npm run dev                   # http://localhost:3000
```

Run the frontend against host services and it will talk to `localhost:3001/3002`
instead of the compose service names — that difference is the whole reason each
project ships its own `.env.example`.

### Useful scripts (identical in both Nest services)

```
npm run build          npm run start:dev      npm run start:debug
npm run lint           npm run format         npm run format:check
npm test               npm run test:watch     npm run test:cov     npm run test:e2e
npm run prisma:generate  npm run prisma:migrate  npm run prisma:deploy  npm run prisma:seed
```

---

## Tests

Everything runs **offline**. The unit specs mock `PrismaService`; the e2e spec
boots the Nest application with the Prisma module overridden, so there is no
database to start and nothing to clean up.

```bash
# all three projects
make test

# without make
cd account-service && npm test && npm run test:e2e
cd ../product-service && npm test && npm run test:e2e
cd ../frontend && npm test                 # typecheck, then the unit specs

# coverage
cd account-service && npm run test:cov
```

> **`npm test` means something different in each project.** The two Nest
> services run Jest — unit specs plus a separate `npm run test:e2e`. The
> frontend has no Jest and no extra dependency: its `test` script is
> `tsc --noEmit` followed by **node's own test runner** over `src/**/*.test.ts`
> (Node 24 strips the types, so the specs are ordinary `.ts` files). That covers
> the pure helpers in `src/lib/` — `safeRedirectPath`, `normaliseProductSort`,
> the Zod schemas, the formatters. Nothing there renders a component or opens a
> socket: adding Vitest + Testing Library for the components is the natural next
> exercise, before stage 2 of the roadmap.

Lint must be clean everywhere:

```bash
make lint
# or: cd account-service && npm run lint   (repeat per project)
```

CI runs that, and `npm run format:check` on top of it — a Prettier script no
pipeline enforces is one the repository drifts away from. Run
`npm run format` in a project to fix what it reports. See
`.github/workflows/ci.yml`.

---

## Make targets, and life without Make

`make` on its own prints the list. Every target is a thin wrapper:

| `make …`  | Does                                     | Raw equivalent                                                                    |
| --------- | ---------------------------------------- | --------------------------------------------------------------------------------- |
| `help`    | list targets (default)                   | —                                                                                 |
| `up`      | build + start, wait for healthy          | `docker compose up -d --build --wait`                                             |
| `up-dev`  | start with the dev override, attached    | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`               |
| `down`    | stop and remove containers (keeps data)  | `docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans` |
| `restart` | recreate only the app containers         | `docker compose up -d --force-recreate --no-deps account-service product-service frontend` |
| `logs`    | tail all logs (`make logs S=frontend`)   | `docker compose logs -f --tail=100`                                               |
| `ps`      | container status + health                | `docker compose ps`                                                               |
| `build`   | build images, start nothing              | `docker compose build`                                                            |
| `migrate` | apply migrations in the running APIs     | `docker compose exec account-service npx prisma migrate deploy` (and product)     |
| `seed`    | seed both databases                      | `docker compose exec account-service npm run prisma:seed` (and product)           |
| `smoke`   | end-to-end proof the stack really works  | see the target — health, `/api/categories`, `/api/products`, admin login          |
| `psql`    | psql on `account_db` (`DB=product_db`)   | `docker compose exec postgres psql -U app -d account_db`                          |
| `test`    | unit tests in all three projects         | `cd <project> && npm test`                                                        |
| `lint`    | lint all three projects                  | `cd <project> && npm run lint`                                                    |
| `clean`   | stop stack, delete `dist/.next/coverage` | `docker compose -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans` + delete the folders |
| `reset`   | **destructive**: also delete `pgdata`    | `docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans && docker compose up -d --build --wait` |

---

## Configuration

All configuration is environment variables — nothing is read from a file at
runtime, nothing is baked into an image.

- **`.env`** at the repo root feeds `docker-compose.yml`. It is **gitignored**;
  copy it from the committed `.env.example`, which documents every variable.
- **`<project>/.env.example`** is for running that project *outside* Docker, where
  the database host is `localhost` rather than the compose service name
  `postgres`, and sibling APIs are on `http://localhost:<port>`.
- Each Nest service validates its environment against a **Joi schema at boot and
  refuses to start** if anything is missing or malformed. That is deliberate: a
  misconfigured service should never reach the "listening" log line.
- No `process.env` read exists outside each service's `src/config/` folder.

The dev secrets in `.env.example` are placeholders with `change_me` in the name.
They are fine for a laptop and unacceptable anywhere else — HS256 is symmetric,
so whoever holds `JWT_ACCESS_SECRET` can mint tokens for any user, including
`ADMIN`.

---

## Repository layout

```
.
├── account-service/          NestJS 11 · identity, JWT issue/rotate · owns account_db
├── product-service/          NestJS 11 · catalogue · owns product_db · verifies JWTs locally
├── frontend/                 Next.js 15 App Router · server-side API calls only
├── infra/
│   ├── postgres/init/        01-create-databases.sql — runs once on an empty volume
│   └── traefik/traefik.yml   static config only (entry points, provider, dashboard, logs)
├── docs/
│   ├── architecture.md       diagram, request flows, why each boundary exists
│   └── devops-roadmap.md     the six-stage learning path
├── .github/
│   ├── workflows/ci.yml      quality matrix · migration drift · compose · images · live stack
│   └── dependabot.yml        weekly updates: the three npm trees, docker, github-actions
├── .vscode/extensions.json   recommended extensions (Prisma, ESLint, Prettier, Docker)
├── docker-compose.yml        production-shaped stack
├── docker-compose.dev.yml    override: host ports, hot reload, debug logging
├── Makefile                  shortcuts (optional)
├── .env.example              every variable, grouped and commented
└── LICENSE                   MIT
```

Routing rules live as **docker labels** in `docker-compose.yml`, not in
`traefik.yml`. Static configuration (ports, providers, logging) is the file;
dynamic configuration (routers, services, middlewares) comes from the labels and
updates live as containers start and stop.

---

## Troubleshooting

**`Bind for 0.0.0.0:80 failed: port is already allocated`**
Something already owns port 80 — IIS, Skype, another Traefik, or on Windows the
`http.sys` "World Wide Web Publishing" service.

```bash
# Linux/macOS
sudo lsof -i :80
# Windows PowerShell
Get-NetTCPConnection -LocalPort 80 -State Listen | Select-Object OwningProcess
Get-Process -Id <pid>
```

Either stop it, or move Traefik: change `- "80:80"` to `- "8000:80"` in
`docker-compose.yml`, then set `NEXT_PUBLIC_SITE_URL=http://localhost:8000` and
`CORS_ORIGIN=http://localhost:8000` in `.env` and recreate. Same drill for
`:8080`, `:5432` (a local Postgres is the usual culprit) and `:3000`.

**`[TypeError: fetch failed] … code: 'ECONNREFUSED'` during the frontend build**
Expected. Two of these scroll past while `docker compose up --build` builds the
frontend image, and the build still exits `0`.

`next build` renders every route once to work out what it can prerender. `/` and
`/products` are Server Components that call the two APIs — which are not running,
because this is a *build*, not a deployment: there is no compose network around
`docker build` and nothing is listening on `account-service:3001`. Both pages
already catch that failure and degrade to an inline notice rather than throwing
(`loadFeatured()` in `app/page.tsx`, `listProducts()` in `app/products/page.tsx`),
so Next marks the routes dynamic and carries on. Nothing stale is baked into the
image.

Do not go looking for the `[home] catalogue unavailable` / `[products] catalogue
unavailable` messages those handlers log. Next intercepts `console.error` in the
server renderer and prints only the **error object**, dropping the string in
front of it — during the build *and* at runtime. So a bare trace is all you ever
get; to see which handler caught it, match the count and order against the
routes, or log the message on its own line.

Worry only if the build actually *fails*, or if a route you expected to be
dynamic (`ƒ` in the build's route table) is listed as static (`○`).

**`/bin/sh^M: bad interpreter` or `exec ./docker-entrypoint.sh: no such file`**
Windows CRLF got into a shell script. `.gitattributes` prevents this, but a file
created before it landed, or extracted from a zip, can still be wrong:

```bash
git config core.autocrlf false
git rm --cached -r . && git reset --hard      # re-checkout with LF
# check one file:
file account-service/docker-entrypoint.sh     # must NOT say "CRLF line terminators"
```

**Prisma: `Failed to fetch schema engine binary` / `ENOTFOUND binaries.prisma.sh`**
`prisma generate` downloads engine binaries on first run and needs the network
(and, behind a corporate proxy, `HTTP_PROXY`/`HTTPS_PROXY`). If a build fails
here, retry once — it is almost always transient. Do not copy `node_modules`
from Windows into a Linux container: the engines are platform-specific, which is
exactly why `docker-compose.dev.yml` masks `node_modules` with a named volume.

**`Can't reach database server at postgres:5432`**
Either Postgres has not finished starting, or you are running the service on the
host with the compose hostname.

```bash
docker compose ps                             # is postgres (healthy)?
docker compose logs postgres | tail -50
docker compose exec postgres pg_isready -U app
```

Outside Docker, the host is `localhost` — use the project's own `.env.example`,
not the root one.

**`database "account_db" does not exist`**
`infra/postgres/init/01-create-databases.sql` runs **only** on a first-time,
empty data directory. If the volume already existed, it never ran:

```bash
make reset      # destructive: drops the pgdata volume, then rebuilds
# or create them by hand:
docker compose exec postgres psql -U app -d app -c 'CREATE DATABASE account_db OWNER app;'
```

**Traefik returns 404 for `/api/...`**
Open <http://localhost:8080> → **HTTP → Routers**. If the router is missing, the
container lacks `traefik.enable=true`, is not on the `learndev_edge` network, or
is not part of this compose project — `traefik.yml` constrains the docker
provider to `com.docker.compose.project=learndev`, so a container started with a
bare `docker run` is invisible to it. If the router is there but errors, check
the `traefik.docker.network` label. Then:

```bash
docker compose logs traefik | grep -i error
docker compose exec frontend wget -qO- http://product-service:3002/health
```

**Everything routes to the frontend**
The catch-all `PathPrefix(/)` router has `priority=1` so the `/api` routers win.
If you added a router without a priority, Traefik ranks by rule length and the
result can surprise you — set an explicit priority.

**A service is `unhealthy` but the logs look fine**
The healthcheck `wget`s `/health` *inside* the container. Confirm by hand:

```bash
docker compose exec account-service wget -qO- http://127.0.0.1:3001/health
```

Remember `/health` is liveness (no database) and `/health/ready` is readiness
(pings the database) — a database outage should show up on the second, not the first.

**`variable is not set. Defaulting to a blank string`**
You have no `.env`. `cp .env.example .env`.

**Changes to a mounted file are not picked up in dev**
File-change events sometimes do not cross a Windows bind mount. Restart that one
service, or set `CHOKIDAR_USEPOLLING=true` in `docker-compose.dev.yml`.

**Start over completely**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans
docker compose build --no-cache
docker compose up -d
```

---

## What to do next: the roadmap

The system is the starting line. Full exercises in
**[docs/devops-roadmap.md](docs/devops-roadmap.md)**.

1. **Docker Compose** — *you are here.* Images, layers, networks, volumes,
   healthchecks, reverse proxying. Prove the network boundaries by hand; break
   `depends_on` and watch what happens.
2. **CI with GitHub Actions** — the matrix in `.github/workflows/ci.yml` already
   lints, format-checks, tests and builds all three projects, catches Prisma
   schema/migration drift, validates the compose files, builds the images and
   then starts the whole stack and smoke-tests it. Make it fail on purpose, then
   make it fast.
3. **Image registry + tagging** — push to GHCR, tag by semver *and* digest, add
   OCI provenance labels and a vulnerability scan. Deploy by digest, not by
   `latest`.
4. **Kubernetes** — translate compose to Deployments/Services/Ingress; map
   `/health` to liveness and `/health/ready` to readiness; move migrations into a
   Job; enforce the two-network split with a NetworkPolicy.
5. **Observability** — the services already emit structured JSON with request-ID
   correlation. Ship it to Loki, scrape Prometheus metrics, trace one login
   end to end, then write an SLO and an error budget.
6. **Infrastructure as Code** — Terraform the cluster and the database, manage
   secrets properly, deploy via GitOps. Final exam: `terraform destroy`, then
   rebuild everything from git alone.

Per-project detail lives in
[`account-service/README.md`](account-service/README.md),
[`product-service/README.md`](product-service/README.md) and
[`frontend/README.md`](frontend/README.md).
