# Architecture

A deliberately small e-commerce system: one edge router, one shop UI, two APIs,
one database server holding two independent databases. Small enough to read end
to end in an afternoon, structured the way a real system is structured, so the
DevOps work later on (CI, registries, Kubernetes, observability) is not a lie.

---

## 1. The picture

```
                                  ┌───────────────┐
                                  │    Browser    │
                                  └───────┬───────┘
                                          │  http://localhost   (port 80 only)
                                          │  Cookies: access_token, refresh_token
                                          │           (httpOnly - JS cannot read them)
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              network: edge                                  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  traefik : v3.3            the ONLY container with a host port        │  │
│  │  :80  entryPoint "web"         :8080  entryPoint "traefik" (dev only) │  │
│  │                                                                       │  │
│  │  routers, in priority order:                                          │  │
│  │    account   PathPrefix(/api/auth) || PathPrefix(/api/users)          │  │
│  │              -> stripPrefix /api  -> account-service:3001             │  │
│  │    product   PathPrefix(/api/products) || PathPrefix(/api/categories) │  │
│  │              -> stripPrefix /api  -> product-service:3002             │  │
│  │    frontend  PathPrefix(/)   priority 1 (lowest, catch-all)           │  │
│  │              -> frontend:3000                                         │  │
│  └───┬───────────────────────────┬───────────────────────────┬───────────┘  │
│      │                           │                           │              │
│      ▼                           ▼                           ▼              │
│  ┌─────────────┐          ┌──────────────────┐      ┌───────────────────┐   │
│  │  frontend   │          │ account-service  │      │  product-service  │   │
│  │  Next.js 15 │          │    NestJS 11     │      │     NestJS 11     │   │
│  │  React 19   │          │      :3001       │      │       :3002       │   │
│  │   :3000     │          │  /auth/*         │      │  /products/*      │   │
│  │             │          │  /users/*        │      │  /categories/*    │   │
│  │ server-side │          │  /health         │      │  /health          │   │
│  │ fetch only  │          │  /health/ready   │      │  /health/ready    │   │
│  └──────┬──────┘          └────┬───────┬─────┘      └───┬───────┬───────┘   │
│         │                      ▲       │                ▲       │           │
│         ├──────────────────────┘       │                │       │           │
│         └──────────────────────────────┼────────────────┘       │           │
│   server-to-server over `edge`;        │                        │           │
│   the browser never does this          │                        │           │
└────────────────────────────────────────┼────────────────────────┼───────────┘
                                         │                        │
┌────────────────────────────────────────┼────────────────────────┼───────────┐
│   network: backend  (internal)         │                        │           │
│                                        ▼                        ▼           │
│                          ┌──────────────────────────────────────────┐       │
│                          │            postgres : 17-alpine          │       │
│                          │                  :5432                   │       │
│                          │  ┌────────────────┐  ┌─────────────────┐ │       │
│                          │  │   account_db   │  │   product_db    │ │       │
│                          │  │  User          │  │  Product        │ │       │
│                          │  │  RefreshToken  │  │  Category       │ │       │
│                          │  └────────────────┘  └─────────────────┘ │       │
│                          │            volume: pgdata                │       │
│                          └──────────────────────────────────────────┘       │
│                                                                             │
│   frontend is NOT on this network.   postgres is NOT on `edge`.             │
└─────────────────────────────────────────────────────────────────────────────┘
```

Membership, stated plainly:

| service           | edge | backend | host port (prod compose)     |
| ----------------- | :--: | :-----: | ---------------------------- |
| `traefik`         |  ✔   |    ✘    | 80, 8080                     |
| `frontend`        |  ✔   |    ✘    | none                         |
| `account-service` |  ✔   |    ✔    | none                         |
| `product-service` |  ✔   |    ✔    | none                         |
| `postgres`        |  ✘   |    ✔    | none                         |

`docker-compose.dev.yml` adds 3000 / 3001 / 3002 / 5432 for debugging. That is
the *only* difference in exposure, and it is deliberately a separate file so you
can never ship it by accident.

Publishing 5432 needs one extra move: a container attached only to an internal
network cannot publish a host port, and `backend` stays `internal: true` in both
files — docker will not recreate an existing network to apply a changed option,
so an override that flipped the flag would work or not work depending on which
stack you happened to start first. Instead the dev file attaches postgres to an
additional, non-internal `devtools` network and publishes 5432 there. The data
plane keeps exactly the properties described above.

---

## 2. Request flow: logging in

The interesting property is that **the browser never holds a JWT** and never
talks to an API. Follow the token.

```
 1  Browser        POST http://localhost/login            (form submit)
                   |
 2  Traefik        router `frontend` (PathPrefix `/`, priority 1)
                   no /api prefix, so the API routers do not match
                   -> frontend:3000
                   |
 3  frontend       Next.js server action  src/app/actions/auth.ts (loginAction)
                   runs ON THE SERVER inside the container
                   |
 4  frontend       fetch(`${API_ACCOUNT_URL}/auth/login`, { cache: 'no-store' })
                   = http://account-service:3001/auth/login
                   over the `edge` network, DNS by compose service name.
                   Note: no /api prefix here - that prefix only exists at the
                   edge, and Traefik strips it before the service ever sees it.
                   |
 5  account-svc    ValidationPipe checks LoginDto
                   UsersService.findByEmail  ->  account_db  (backend network)
                   compare(dto.password, user.password)   bcryptjs, cost 12
                   (the column is `password` and it stores the hash)
                   |
 6  account-svc    signs two tokens, both HS256:
                     access  { sub, email, role, type:'access'  }  ttl 15m
                     refresh { sub, jti,         type:'refresh' }  ttl 7d
                   stores bcrypt(refreshToken) in RefreshToken row
                   200 { user, accessToken, refreshToken }
                   ('user' never contains the password hash)
                   |
 7  frontend       cookies().set('access_token',  ..., { httpOnly, sameSite:'lax',
                                                         secure: NODE_ENV==='production',
                                                         path:'/', maxAge: 15m })
                   cookies().set('refresh_token', ..., maxAge: 7d)
                   redirect('/profile')
                   |
 8  Browser        receives Set-Cookie + 303. document.cookie shows NOTHING:
                   httpOnly means script cannot read it, which is the point.
```

On a later request to a protected page, `middleware.ts` sees the cookie, lets
the request through, and the server component attaches
`Authorization: Bearer <access_token>` on the server side. Once the access
cookie has expired, the middleware rotates the refresh token first — which is
the next section, and the most interesting fifty lines in the repository.

---

## 3. Request flow: the silent refresh, and the race it has to survive

Two facts, and everything below follows from them:

- the access cookie lives 15 minutes, the refresh cookie 7 days;
- a refresh token is **single-use**. `AuthService.refresh` revokes the presented
  row and issues a new one in the same transaction, and a token presented twice
  is read as theft: `revokeAllTokensForUser` kills every session that user has.

Rotation happens in `frontend/src/middleware.ts` rather than in a page or a
server action, because the middleware is one of the few places Next.js allows
cookies to be written. Rotating during a Server Component render would spend the
single-use token with nowhere to put its replacement.

### The happy path

```
 Browser              middleware.ts (frontend)            account-service
    |                          |                                 |
    | GET /profile             |                                 |
    | cookie: refresh_token=R1 |                                 |
    | (access_token expired)   |                                 |
    |------------------------->|                                 |
    |                          | rotate(R1): no memo for R1,     |
    |                          | so start one POST               |
    |                          | POST /auth/refresh { R1 }       |
    |                          |-------------------------------->|
    |                          |                                 | verify HS256, type==='refresh'
    |                          |                                 | row(jti): exists? revoked? expired?
    |                          |                                 | bcrypt-compare the stored hash
    |                          |                                 | TRANSACTION
    |                          |                                 |   revoke R1's row
    |                          |                                 |   insert R2's row
    |                          | 200 { accessToken A2,           |
    |                          |       refreshToken R2 }         |
    |                          |<--------------------------------|
    |                          | memo[R1] = {A2,R2}, settledAt=now
    |                          | request.cookies.set(...)   <- this render sees A2
    |                          | response.cookies.set(...)  <- the browser gets A2,R2
    | 200 + Set-Cookie A2, R2  |                                 |
    |<-------------------------|                                 |
```

### The race

One navigation is not one request. Clicking a link in the header produces the
document request *plus* a `<Link>` prefetch for every other link on the page,
all within a few milliseconds, all carrying the same cookies. A second open tab
does the same thing. Once the access cookie has expired, each of them
independently decides to rotate — with the same `R1`:

```
   t+0ms   prefetch   ──POST R1──▶  rotate: R1 revoked, R2 issued          ✅
   t+2ms   document   ──POST R1──▶  R1.revokedAt is set  →  REUSE DETECTED
                                    revokeAllTokensForUser(...)            ❌
   t+5ms   tab 2      ──POST R1──▶  ...same, and R2 is already dead
```

The user is signed out on every device, at random, by nothing more exotic than
Next.js prefetching a nav link. It is close to impossible to reproduce by hand,
because a human cannot click twice inside the same 3 ms.

### Single-flight rotation

So the middleware memoises rotation **by the token being spent** — the map keyed
on `R1`, not on the user or the session:

```
   prefetch  ─rotate(R1)─▶  miss   ──▶ one POST in flight ──▶ {A2,R2}
   document  ─rotate(R1)─▶  hit    ──▶ awaits that same promise ──▶ {A2,R2}
   tab 2     ─rotate(R1)─▶  hit, settled 3 s ago (< 10 s) ──▶ {A2,R2}
             ─rotate(R1)─▶  hit, settled 30 s ago → evicted → a real POST,
                            which account-service correctly calls reuse
```

Exactly one POST per refresh token ever leaves the container. The memo is kept
for `ROTATION_MEMO_MS` (10 s) after it settles: long enough to answer the
stragglers that were already in flight with the old cookie, short enough that a
genuinely stolen token is rejected almost immediately. `pruneRotations` drops
expired entries and caps the map at 500 so a flood of distinct tokens cannot
grow it without bound.

Three details worth copying rather than reinventing:

- **"No" and "no answer" are different facts.** `requestRotation` returns
  `rejected` for a 4xx (a verdict on the token) and `unavailable` for a 5xx,
  a timeout or an unreachable service. Only `rejected` deletes the cookies —
  conflating them turns a ten-second account-service restart into a mass logout
  of everyone whose access token happened to expire during it.
- **`unavailable` is forgotten immediately** instead of being memoised for the
  grace window. Nothing was spent, so there is nothing to protect, and the next
  request should get a fresh attempt rather than a cached failure.
- **Both cookie jars are written.** `request.cookies.set` makes the new token
  visible to the render this same request is about to trigger;
  `response.cookies.set` is what actually reaches the browser. Miss the first
  and the page renders signed-out despite a successful rotation.

**Where this fix is not enough.** The map is per-process, which is the right
scope for one frontend container and nothing more. Run two replicas and the same
race reappears *between* them. The durable fix belongs in account-service:
claim the row with a conditional update so only one rotation can win, and answer
a replay inside a short grace window with the pair that replaced it instead of
revoking the family. That is a genuinely good exercise, and the middleware
comment says the same thing.

---

## 4. Request flow: listing products

```
 1  Browser     GET http://localhost/products?page=2&search=mug
 2  Traefik     `/products` does not start with `/api`, so the account and
                product routers do NOT match. Catch-all `frontend` router wins.
                -> frontend:3000
 3  frontend    server component app/products/page.tsx reads searchParams
 4  frontend    productApi.listProducts()  ->  GET http://product-service:3002/products
                                              ?page=2&limit=12&search=mug
                (src/lib/api/products.ts; the page defaults to limit=12)
                anonymous: no Authorization header, this endpoint is public
 5  product-svc PaginationQueryDto coerces + validates page/limit
                Prisma: findMany + count in one transaction
 6  product-svc 200 { data: [...], meta: { page, limit, total, totalPages } }
 7  frontend    renders server-side HTML, streams it back
```

A *direct* API call from curl takes the other branch:

```
    curl http://localhost/api/products
      -> Traefik router `product` matches PathPrefix(`/api/products`)
      -> middleware product-stripapi rewrites the path to /products
      -> product-service:3002/products
```

Same service, two different entry paths — that is the whole trick behind the
`/api` prefix living only in the router.

---

## 5. Why each boundary exists

**Traefik in front of everything.** One port is open to the world. Adding TLS,
rate limiting, auth at the edge, or a canary split later is a label change, not
a code change. It also means the service ports (3000/3001/3002) are an internal
detail, so nothing in the browser can depend on them.

**No global prefix in Nest.** Traefik strips `/api`, so the service's own route
table is `/auth/login`, not `/api/auth/login`. The service is therefore
identical whether it runs behind the router, standalone on `localhost:3001`, or
inside a Kubernetes Ingress that routes differently. The routing prefix belongs
to the deployment, not the application.

**Two networks.** `edge` is north-south traffic; `backend` is the data plane and
is marked `internal`, so it has no route off the host at all. The frontend has
no business reaching Postgres, so it simply cannot: the connection fails at the
network layer, not at a code review. This is the compose-level rehearsal for
Kubernetes NetworkPolicies in stage 4.

**Server-side-only API calls.** Because every backend call happens in the
Next.js server, the JWT lives in an httpOnly cookie and never enters JavaScript.
XSS on the shop page cannot exfiltrate a token. It also means CORS is nearly a
non-issue: the browser only ever has one origin.

**Local token verification in product-service.** The catalogue verifies the
access token's signature with the shared `JWT_ACCESS_SECRET` and reads
`role` from the payload. It holds no user table and makes no call to
account-service. A stateless check has no network hop, no cascading failure and
no shared database — the cost is that revocation is only as fast as the 15-minute
access TTL, which is exactly the trade-off refresh-token rotation is there to
manage.

**Both services reject `type !== 'access'`.** A refresh token is also a valid
HS256 JWT. Without the `type` claim check, a stolen refresh token would work as
a bearer credential for seven days.

---

## 6. Data ownership: one database per service

> A service owns its data. No other service reads or writes its tables — not
> through a shared connection, not through a clever view, not "just this once".

`account_db` holds `User` and `RefreshToken`. `product_db` holds `Product` and
`Category`. Each service ships its own `prisma/schema.prisma` and its own
`prisma/migrations/`. There is no shared schema, no cross-database foreign key,
no join across the boundary.

Why this matters more than it looks:

- **Migrations stay independent.** `account-service` can add a column without
  coordinating a release with `product-service`. Each container runs
  `prisma migrate deploy` for its own database in its own entrypoint.
- **The schema stops being a public API.** If another service could read your
  tables, every column rename becomes a cross-team negotiation. The HTTP
  contract is the API; the schema is private.
- **Failure and scale are per-service.** The catalogue can be read-replicated
  without touching identity storage.
- **It survives the move to Kubernetes.** Splitting one Postgres container into
  two managed instances is a connection-string change, because nothing was ever
  joining across them.

The single `postgres` container running two databases is a *lab* convenience —
one process to start, one volume to back up. The ownership rule is what makes it
honest, and it is enforced by configuration: each service is handed exactly one
`DATABASE_URL` and never learns the other's.

If a product ever needs the owner's name, it gets it the same way the browser
would: over HTTP, or by storing the `userId` it was given and letting the
frontend compose the two responses.

---

## 7. Configuration and startup order

Every setting arrives as an environment variable (12-factor). `.env` at the repo
root feeds `docker-compose.yml`; each service validates what it receives against
a Joi schema at boot and **fails fast** if anything is missing or malformed — a
service with a bad config should never reach the "listening" log line.

Startup is ordered by health, not by hope:

```
postgres (healthy: pg_isready)
   └─▶ account-service   entrypoint: prisma migrate deploy && node dist/main
   └─▶ product-service   entrypoint: prisma migrate deploy && node dist/main
          └─▶ frontend   (waits for both APIs to report healthy)
```

`/health` is **liveness**: it answers from memory and never touches the database,
so a database blip does not get a healthy process killed and restarted.
`/health/ready` is **readiness**: it pings Postgres through
`PrismaHealthIndicator`, and is what a load balancer should gate traffic on.
Conflating the two is the single most common way to turn a database hiccup into
an outage. Compose owns the healthcheck definitions — the Dockerfiles
deliberately declare none, so there is one source of truth.
