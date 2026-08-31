# product-service

The product catalogue microservice: **NestJS 11 + Prisma 6 + PostgreSQL 17**, owning the
`product_db` database (categories and products).

It closely mirrors `account-service` - same layout, same conventions, same envelope, same error
shape - so the two can be read side by side. It is **not** a file-for-file copy, and the
differences are deliberate:

- **Authentication.** This service only **verifies** JWTs; it never issues them, so there is no
  `AuthService`, no refresh-token table and no bcrypt.
- **`Role`.** account-service gets the enum from Prisma because it owns the `users` table. This
  service has no user table, so `src/common/enums/role.enum.ts` keeps a local copy: the two
  services agree on the wire format (the JWT), not on a schema.
- **Error DTO.** The `{ statusCode, message, error, timestamp, path }` body is declared here as a
  real `ErrorResponseDto` class so Swagger can reference it from every `@ApiNotFoundResponse` and
  friends; account-service declares the same shape as an interface inside its filter.

---

## HTTP API

Routes are mounted at the root. Traefik strips the `/api` prefix before forwarding, so
`http://localhost/api/products` reaches this container as `GET /products`. There is no Nest
global prefix - the service stays directly runnable and testable without the proxy in front of it.

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/products` | public | Paginated list of **published** products. Query: `page`, `limit` (max 100), `search`, `categoryId`, `sort`, `isActive` (ADMIN only) |
| GET | `/products/:id` | public | One product, `404` if it does not exist **or is unpublished** |
| POST | `/products` | ADMIN | Create. `409` on duplicate `sku`/`slug`, `400` if `categoryId` is unknown |
| PATCH | `/products/:id` | ADMIN | Partial update |
| DELETE | `/products/:id` | ADMIN | `204 No Content` |
| GET | `/categories` | public | All categories (a small bounded list, so not paginated) |
| GET | `/categories/:id` | public | One category, `404` if it does not exist |
| POST | `/categories` | ADMIN | Create. `409` on duplicate `name`/`slug` |
| GET | `/health` | public | Liveness - does **not** touch the database |
| GET | `/health/ready` | public | Readiness - pings `product_db` |

Swagger UI: **http://localhost:3002/docs**, mounted only when `NODE_ENV !== production` because an
API schema is a map of the attack surface.

### Paginated envelope

Identical in both services:

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

### Sorting

`sort` is `field:direction`, validated against a whitelist:
`createdAt`, `updatedAt`, `name`, `priceCents`, `stock` combined with `asc` or `desc`.
The default is `createdAt:desc`. A caller-supplied column name is never handed to Prisma
unchecked - the same discipline you would apply to a raw SQL ORDER BY clause. The whitelist is
enforced twice, in the DTO and again in the service, because a service must not trust its caller.

### Publication state (`isActive`)

`isActive` is what takes a product off sale, so it has to actually hide it:

- **Anonymous or `USER` callers** always get published products only, on both `/products` and
  `/products/:id`. An unpublished product is a `404` on the deep link, not a visible page - a
  shared URL or a search-engine result must not keep working after the product is withdrawn. The
  `isActive` query parameter is ignored for these callers.
- **`ADMIN` callers** (a valid bearer token on the otherwise public endpoint) see everything and
  may narrow it with `?isActive=false` to review what is withdrawn.

`@Public()` therefore means "do not reject anonymous callers", not "ignore the token": the global
`JwtAuthGuard` still runs Passport on public routes, so `@CurrentUser()` sees an ADMIN when one is
present and `undefined` otherwise. A missing or invalid token on a public route leaves the caller
anonymous instead of returning `401`.

### Response shape

Endpoints return `ProductEntity` / `CategoryEntity`, never a raw Prisma row. Both are `@Exclude()`d
classes whose fields are individually `@Expose()`d and built with
`plainToInstance(..., { excludeExtraneousValues: true })` - the same allow-list technique as
`UserResponseDto` in account-service. Add a `costCents`, a supplier note or an internal flag to
`model Product` and it stays private until somebody deliberately exposes it. Returning the database
row instead would publish every new column to the unauthenticated `GET /products` with no code
change and no failing test.

### Money

Prices are `priceCents` (an **integer** number of minor units) plus a `currency` code. `18999`
means `$189.99`. Floating point money accumulates rounding errors under arithmetic, so it is never
stored or transported as a float. Formatting for humans is the frontend's job.

### Errors

Every failure comes back from a single `AllExceptionsFilter` in one shape:

```json
{
  "statusCode": 404,
  "message": "Product with id ... not found",
  "error": "Not Found",
  "timestamp": "2026-01-01T12:00:00.000Z",
  "path": "/products/8f0a..."
}
```

Validation failures return `400` with `message` as the array of class-validator messages. 5xx
responses are logged with a stack trace; 4xx responses are logged at warn level, so dashboards
are not buried by ordinary client mistakes.

---

## Authentication and authorisation

This service has **no user table and makes no network call to account-service**. It verifies the
HS256 signature of an access token locally with `JWT_ACCESS_SECRET`, which must be byte-identical
to the secret account-service signs with.

- Reads are public; writes require `role === ADMIN`.
- `JwtAuthGuard` is registered globally, so routes are **deny-by-default**. Public routes opt out
  with `@Public()`, which means forgetting a decorator locks an endpoint down rather than opening
  it up.
- A token whose payload `type` is not `"access"` is rejected, so a refresh token can never be
  replayed as a bearer token.
- The signing algorithm is pinned to `HS256`.

The trade-off of local verification is that a revoked user stays valid until their access token
expires, which is why `JWT_ACCESS_TTL` is short. The upside is that there is no synchronous
cross-service dependency on the request path: account-service being down cannot take the
catalogue down with it.

---

## Rate limiting

Both services are rate limited, but they are limited for opposite reasons. account-service is
guarding a bcrypt-backed login against credential stuffing; here there is no password to guess and
the reads are cheap, so the buckets are split by what a request **costs** - see
`src/common/throttling.ts`:

| Bucket  | Counted per                                  | Limit    |
| ------- | -------------------------------------------- | -------- |
| `ip`    | client address + route, every endpoint        | 300/min  |
| `write` | client address + route, `POST`/`PATCH`/`PUT`/`DELETE` only | 20/min |

The read ceiling is deliberately roomy: a catalogue page issues several `GET /products` calls and
a paginated indexed query is not expensive. The write ceiling is deliberately tight: an ADMIN
editing the catalogue by hand never approaches 20 writes a minute, so the limit costs nothing in
normal use while capping how fast a stolen admin token can rewrite or delete the catalogue.

The split is by HTTP method rather than a `@Throttle()` decorator on each write handler, so a new
ADMIN endpoint is covered the day it is added - the same fail-closed reasoning as the global
`JwtAuthGuard`. Either bucket tripping returns **429** in the usual `AllExceptionsFilter` envelope.
The rate limit headers carry the bucket name as a suffix, because naming a throttler changes the
header names: `X-RateLimit-Limit-ip`, `X-RateLimit-Remaining-ip`, `X-RateLimit-Reset-ip` and, on a
blocked write, `Retry-After-write`. Only a throttler literally named `default` gets the unsuffixed
`X-RateLimit-*` / `Retry-After` spelling, so a client written against the plain names sees nothing.
The health probes are exempt, because a throttled probe would report the container unhealthy for
the one reason restarting cannot fix.

Two things to know before trusting it in production, both shared with account-service:

- requests the frontend makes server-side all arrive from the frontend container's address, so
  they share one bucket - a genuinely per-client limit belongs at the edge, as a Traefik
  `ratelimit` middleware;
- the counters are in this process's memory, so two replicas each enforce their own half of the
  limit. A shared store (Redis) is the fix.

---

## Configuration

`src/config/` is the only place in the service that reads `process.env`. A Joi schema validates
the environment at startup and the process **exits** on a missing or malformed variable, so a
misconfigured container fails fast instead of booting into a half-working state.

| Variable | Required | Default | Notes |
| -------- | -------- | ------- | ----- |
| `NODE_ENV` | no | `development` | one of `development`, `test`, `production` |
| `LOG_LEVEL` | no | `info` | pino level |
| `LOG_PRETTY` | no | `false` | `true` for human-readable pino-pretty lines instead of JSON |
| `PRODUCT_SERVICE_PORT` | no | `3002` | bound on `0.0.0.0`, never on loopback |
| `PRODUCT_DATABASE_URL` | yes | - | Prisma datasource |
| `JWT_ACCESS_SECRET` | yes | - | at least 32 chars, shared with account-service |
| `CORS_ORIGIN` | no | `http://localhost` | one origin, or a comma-separated list |

Copy `.env.example` to `.env` for standalone runs, where the database host is `localhost`. Under
docker compose the same variables arrive from the **root** `.env`, where the host is the compose
service name `postgres`. Unknown variables are tolerated because compose injects the whole root
env file into every container.

---

## Local development (no Docker)

Requires Node 24 and a reachable PostgreSQL with a `product_db` database.

```bash
cd product-service
cp .env.example .env          # then adjust PRODUCT_DATABASE_URL if needed
npm ci
npm run prisma:generate       # generate the typed Prisma client
npm run prisma:deploy         # apply prisma/migrations to product_db
npm run prisma:seed           # 3 categories + 8 products, idempotent
npm run start:dev
```

Then open http://localhost:3002/docs.

### Scripts

| Script | Purpose |
| ------ | ------- |
| `npm run build` | compile to `dist/` |
| `npm run start:dev` / `npm run start:debug` | watch mode / watch mode with the inspector |
| `npm run start:prod` | `node dist/main` |
| `npm run lint` | ESLint flat config, zero warnings tolerated |
| `npm run format` / `npm run format:check` | Prettier write / verify |
| `npm test` / `npm run test:watch` / `npm run test:cov` | unit tests |
| `npm run test:e2e` | HTTP end-to-end tests |
| `npm run prisma:generate` | regenerate the client after a schema change |
| `npm run prisma:migrate` | `prisma migrate dev` - **developer machine only** |
| `npm run prisma:deploy` | `prisma migrate deploy` - what containers and CI run |
| `npm run prisma:seed` | run `prisma/seed.ts` via `node` (Node 24 strips the types - no ts-node) |

---

## Database and migrations

`prisma/schema.prisma` defines two models mapped to the `categories` and `products` tables.
`products` is indexed on `categoryId` and `isActive`, and the category relation uses
`onDelete: Restrict` so a category cannot be deleted out from under its products.

The initial migration in `prisma/migrations/0_init/` was generated **offline**, with no database
running:

```bash
mkdir -p prisma/migrations/0_init
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script --output prisma/migrations/0_init/migration.sql
```

`prisma/migrations/migration_lock.toml` pins the provider to `postgresql`.

Migrations are applied by `docker-entrypoint.sh` when the container starts, using
`prisma migrate deploy`. That command only *applies* migrations that already exist in the repo: it
never generates SQL and never prompts, which is what makes it safe to run unattended. It is also
idempotent, so restarts and additional replicas are harmless. `prisma migrate dev` is the
interactive developer command and must never run inside a container.

### Seed data

`prisma/seed.ts` upserts 3 categories (Electronics, Home & Kitchen, Outdoors) and 8 products.
Every write is an `upsert` keyed on a natural unique column (`slug` or `sku`), so running the seed
twice converges to the same state instead of duplicating rows or tripping a unique constraint.

The `"prisma": { "seed": ... }` key runs **`node prisma/seed.ts`**, not `ts-node`. The production
image installs with `npm ci --omit=dev`, so a `ts-node` seed command cannot run inside the shipped
container - `docker compose exec product-service npm run prisma:seed` would fail with
`sh: ts-node: not found` and the catalogue would stay empty. The seed uses only erasable type
syntax (interfaces and annotations), so Node 24 strips the types and runs the file as-is, both on
the host and in the image.

---

## Tests

Everything runs **offline**: Prisma is mocked, so no database and no network are required. That is
what makes the suite safe to run on every CI push.

```bash
npm test          # unit: ProductsService (mocked Prisma), RolesGuard, JwtStrategy, throttler config
npm run test:e2e  # boots the real Nest app with PrismaService replaced by a double
```

The e2e suite exercises the whole request pipeline - routing, `ValidationPipe`, the global guards
and the exception filter - which is where wiring bugs actually live. It asserts the paginated
envelope, the `400` shape for a bad `limit`, `404` for an unknown id, `404` for an unpublished
product, that a non-exposed database column cannot reach the response body, and `401` on every
write endpoint without a bearer token.

---

## Docker

Multi-stage build on `node:24-alpine`. The final image runs as the unprivileged `node` user with
`dumb-init` as PID 1, so `docker stop` delivers SIGTERM to the app and Nest's shutdown hooks run
(Prisma disconnects cleanly). `npm ci` is used everywhere, never `npm install`, so an image build
can never silently pick up a different transitive version. The runtime stage installs with
`--omit=dev` and the Prisma client is regenerated against that pruned tree.

Healthchecks intentionally live in `docker-compose.yml` rather than in the Dockerfile, so compose
is the single source of truth for how this service is probed.

Two things worth knowing about the dependency split, both driven by `--omit=dev`:

- The `prisma` CLI is a **runtime** dependency, not a dev dependency, because the container
  entrypoint runs `prisma migrate deploy` before starting the app.
- `pino-pretty` is a **dev** dependency and is not installed in the image at all. Pretty logging is
  gated on `LOG_PRETTY`, so the shipped container emits JSON and never tries to load a formatter it
  does not have.

---

## Layout

```
src/
  main.ts               bootstrap: helmet, CORS, ValidationPipe, Swagger, shutdown hooks
  app.module.ts         module wiring, global filter/interceptor/guards, pino logger
  config/               app-config.module.ts, Joi schema + typed factory
                        (the only place reading process.env)
  common/
    decorators/         @Roles, @Public, @CurrentUser, @ApiPaginatedResponse
    dto/                PaginationQueryDto, PaginatedResponseDto, ErrorResponseDto
    enums/              Role (USER | ADMIN)
    filters/            AllExceptionsFilter
    interceptors/       LoggingInterceptor (per-handler timing)
    interfaces/         JwtAccessPayload, AuthenticatedUser
    utils/              slugify, Prisma error narrowing
    throttling.ts       rate limit buckets (generous reads, tight writes)
  prisma/               PrismaModule (global) + PrismaService lifecycle
  auth/                 JwtStrategy, JwtAuthGuard, RolesGuard - verification only
  products/             controller, service, DTOs, entity
  categories/           controller, service, DTOs, entity
  health/               Terminus liveness + readiness, PrismaHealthIndicator
prisma/
  schema.prisma         Category + Product
  migrations/0_init/    generated offline with `prisma migrate diff`
  seed.ts               idempotent upserts
test/
  app.e2e-spec.ts       HTTP tests with Prisma mocked
  setup-env.ts          environment for the test run
```

---

## Logging

`nestjs-pino` emits structured JSON, one object per line. Pretty-printed lines are an explicit
opt-in via `LOG_PRETTY=true`, never inferred from `NODE_ENV` - the base compose stack runs with
`NODE_ENV=development`, and inferring it there would leave one service emitting text and the other
JSON in the same `docker compose logs`. `req.headers.authorization`, cookies and any `password`
field are redacted:
once a secret reaches the log store it is replicated, backed up, and searchable by everyone with
log access. Every request carries an `x-request-id` - honoured from the incoming header when
present, echoed on the response - so a single call can be traced across Traefik, the frontend and
this service. The two health endpoints are excluded from request logging, because probes fire
every few seconds and would bury real traffic.
