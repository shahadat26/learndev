# account-service

The identity microservice for the learndev e-commerce lab. It owns **account_db**
and is the only service that ever touches it.

Responsibilities:

- registration and login (bcrypt password hashing, cost 12)
- issuing HS256 JWTs, with **refresh-token rotation and reuse detection**
- user profiles, and an admin-only user listing
- liveness and readiness probes for the orchestrator

It deliberately does **not** know anything about products. `product-service`
authorises requests by verifying the same access tokens locally with the shared
`JWT_ACCESS_SECRET` — it never calls this service.

---

## Endpoints

No global prefix is configured: Traefik strips `/api` before forwarding, so
`/api/auth/login` at the edge arrives here as `/auth/login`.

| Method | Path             | Auth        | Success | Notes                                              |
| ------ | ---------------- | ----------- | ------- | -------------------------------------------------- |
| POST   | `/auth/register` | public      | 201     | `{user, accessToken, refreshToken}`; 409 on dup.    |
| POST   | `/auth/login`    | public      | 200     | `{user, accessToken, refreshToken}`; 401 on bad creds |
| POST   | `/auth/refresh`  | public      | 200     | `{accessToken, refreshToken}`; rotates the token    |
| POST   | `/auth/logout`   | public      | 204     | Idempotent; revokes the refresh token              |
| GET    | `/users/profile` | bearer      | 200     | The caller's own user object                       |
| PATCH  | `/users/profile` | bearer      | 200     | `{firstName?, lastName?}`                          |
| GET    | `/users`         | bearer ADMIN| 200     | Paginated; `?page&limit`                           |
| GET    | `/health`        | public      | 200     | Liveness — does **not** touch the database         |
| GET    | `/health/ready`  | public      | 200/503 | Readiness — pings the database                     |

A `user` **never** includes the password hash:

```json
{ "id": "...", "email": "...", "firstName": null, "lastName": null,
  "role": "USER", "createdAt": "...", "updatedAt": "..." }
```

Paginated responses use the envelope shared with `product-service`:

```json
{ "data": [], "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 } }
```

Errors always come back as:

```json
{ "statusCode": 404, "message": "...", "error": "Not Found",
  "timestamp": "2026-01-01T00:00:00.000Z", "path": "/users/profile" }
```

Interactive API docs are served at **`/docs`** whenever `NODE_ENV !== production`.

---

## Auth model

| Token   | Secret                | TTL                 | Payload                                    |
| ------- | --------------------- | ------------------- | ------------------------------------------ |
| access  | `JWT_ACCESS_SECRET`   | `JWT_ACCESS_TTL`    | `{ sub, email, role, type: "access" }`     |
| refresh | `JWT_REFRESH_SECRET`  | `JWT_REFRESH_TTL`   | `{ sub, jti, type: "refresh" }`            |

Both services reject any token whose `type` is not `"access"` on protected
routes — without that claim a long-lived refresh token would work as an access
token.

**Rotation.** Each refresh token has a `RefreshToken` row storing a bcrypt hash
of the token (never the token itself). `/auth/refresh` revokes the presented
token and issues a new one, so a refresh token is single-use. Presenting an
already-rotated token is treated as a **replay**: every live session for that
user is revoked and the user must log in again. That is the standard, and
deliberately blunt, response — the server cannot tell the thief from the victim.

---

## Rate limiting

Every `/auth/*` route is public and every one of them spends a bcrypt hash
(~0.5s of CPU at cost 12), which makes them both a credential-stuffing target
and a cheap way to saturate the single Node event loop. Two independent buckets
guard them - see `src/common/throttling.ts`:

| Bucket       | Counted per                         | Limit                                                     |
| ------------ | ----------------------------------- | --------------------------------------------------------- |
| `ip`         | client address + route              | 100/min; 20/min on `/auth/login` and `/auth/register`, 30/min on `/auth/refresh` |
| `credential` | client address + the email in the body + route | 5/min                                            |

Either one tripping returns **429** in the usual error envelope. The rate limit
headers carry the bucket name as a suffix, because naming a throttler changes the
header names: `X-RateLimit-Limit-ip`, `X-RateLimit-Remaining-ip`,
`X-RateLimit-Reset-ip` and, on a blocked login, `Retry-After-credential`. Only a
throttler literally named `default` gets the unsuffixed `X-RateLimit-*` /
`Retry-After` spelling, so a client written against the plain names sees nothing.
The health probes are exempt.

Why two: a flood of *random* emails from one address never fills a credential
bucket, and guesses for one account spread over a botnet never fill an IP one.

Two things to know before trusting it in production:

- requests the frontend makes server-side all arrive from the frontend
  container's address, so they share one `ip` bucket - a genuinely per-client
  limit belongs at the edge, as a Traefik `ratelimit` middleware;
- the counters are in this process's memory, so two replicas each enforce their
  own half of the limit. A shared store (Redis) is the fix.

`/auth/register` still answers 409 for an address that already exists, which is
an account-enumeration oracle - the same one the login path deliberately avoids.
Keeping it is a conscious trade-off in favour of a usable signup form; the
`credential` and `ip` buckets are what stop it being enumerated in bulk.

---

## Environment variables

Validated by Joi at boot; the process **refuses to start** if any is missing or
malformed. See `.env.example`.

| Variable               | Required | Default | Notes                                        |
| ---------------------- | -------- | ------- | -------------------------------------------- |
| `NODE_ENV`             | no       | `development` | `production` hides Swagger              |
| `LOG_LEVEL`            | no       | `info`  | pino level, or `silent`                       |
| `LOG_PRETTY`           | no       | `false` | `true` for human-readable local logs          |
| `ACCOUNT_SERVICE_PORT` | no       | `3001`  |                                               |
| `ACCOUNT_DATABASE_URL` | **yes**  | —       | Postgres URL for `account_db`                 |
| `JWT_ACCESS_SECRET`    | **yes**  | —       | min 32 chars                                  |
| `JWT_ACCESS_TTL`       | no       | `15m`   | `ms` duration or seconds                      |
| `JWT_REFRESH_SECRET`   | **yes**  | —       | min 32 chars                                  |
| `JWT_REFRESH_TTL`      | no       | `7d`    |                                               |
| `BCRYPT_SALT_ROUNDS`   | no       | `12`    | Lower only in tests                           |
| `CORS_ORIGIN`          | no       | `http://localhost` | Comma-separated absolute origins; `*` is rejected |

`LOG_PRETTY` and `BCRYPT_SALT_ROUNDS` are extras beyond the root `.env.example`;
both have safe defaults, so the compose environment works untouched.

---

## Running locally (no Docker)

Needs Node 24 and a reachable Postgres with an `account_db` database.

```bash
cd account-service
cp .env.example .env          # then edit if your Postgres differs
npm install
npm run prisma:generate       # generate the typed client
npm run prisma:deploy         # apply migrations
npm run prisma:seed           # optional demo users
npm run start:dev             # http://localhost:3001, docs at /docs
```

## Running in Docker

From the repository root, `docker compose up` builds and starts everything.
This service is reached through Traefik at `http://localhost/api/auth/...`;
`docker-compose.dev.yml` additionally publishes port 3001 directly so you can
reach Swagger at `http://localhost:3001/docs`.

Migrations are **not** baked into the image — `docker-entrypoint.sh` runs
`prisma migrate deploy` on every container start, then `exec`s the app. That is
idempotent, safe to repeat on restarts, and guarantees the schema matches the
code about to serve traffic.

## Tests

```bash
npm test          # unit specs
npm run test:e2e  # boots the whole Nest app with Prisma mocked
npm run test:cov  # coverage
```

Both suites run **offline with no database**: the e2e spec overrides
`PrismaService` with an in-memory double, so guards, pipes, the exception filter
and real JWT signing/verification are all exercised without a container.

## Migrations

There is no live database during the initial build, so `prisma/migrations/0_init`
was generated offline:

```bash
npx prisma migrate diff --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script --output prisma/migrations/0_init/migration.sql
```

Use `npm run prisma:migrate` (`migrate dev`) for new schema changes during
development, and `npm run prisma:deploy` (`migrate deploy`) everywhere else.

## Seeded credentials

`npm run prisma:seed` is idempotent (upserts only), and runs **inside the
shipped image too**: `package.json` wires `prisma db seed` to plain
`node prisma/seed.ts`, not `ts-node`. The production image installs with
`npm ci --omit=dev`, so ts-node and typescript are not in it - Node 24's native
type stripping is what makes the seed portable. Keep `prisma/seed.ts` to
erasable syntax only (no `enum`, no decorators, no parameter properties).

| Email              | Password    | Role  |
| ------------------ | ----------- | ----- |
| `admin@shop.local` | `Admin123!` | ADMIN |
| `user@shop.local`  | `User123!`  | USER  |

Demo credentials for a local lab only — never ship them anywhere real.

## Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| Boot fails with a Joi list of errors | A required env var is missing or malformed. This is intentional fail-fast behaviour — fix `.env`. |
| `Environment variable not found: ACCOUNT_DATABASE_URL` from a Prisma CLI command | The CLI reads `.env` from the service directory; create it from `.env.example`. |
| `exec /usr/local/bin/docker-entrypoint.sh: no such file or directory` in Docker | The script was checked out with CRLF endings. `.gitattributes` pins `*.sh` to LF; re-clone or run `dos2unix`. |
| 401 on every protected route | The access token expired (15m by default), or `JWT_ACCESS_SECRET` differs between this service and `product-service`. They must match exactly. |
| 429 on `/auth/login` or `/auth/register` | The rate limiter. Five wrong passwords for one email, or 20 attempts from one address, per minute. Wait out the window; see `src/common/throttling.ts`. |
| 403 instead of 401 on `GET /users` | You are authenticated but not an ADMIN — log in as `admin@shop.local`. |
| `/health/ready` returns 503 | Postgres is unreachable. `/health` staying 200 is correct: restarting the API would not fix a database outage. |
