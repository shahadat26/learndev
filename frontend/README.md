# frontend

The storefront for the learndev lab: **Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS 4**.

It renders every page on the server and is the only public entry point a shopper touches. It talks
to `account-service` and `product-service` over the internal Docker network; the browser never calls
them directly and never receives a JWT.

## How a request flows

```
browser ──► Traefik :80 ──► frontend :3000 ──► account-service :3001   (auth, profile)
                                          └──► product-service :3002   (catalogue)
```

`PathPrefix('/')` with priority 1 sends everything Traefik has not already matched (`/api/...`) to
this service, so the storefront gets the leftovers and the API routers win.

## Routes

| Route            | Rendering            | Notes                                                   |
| ---------------- | -------------------- | ------------------------------------------------------- |
| `/`              | server               | Hero, categories, four featured products                |
| `/products`      | server, searchParams | `?page&limit&search&categoryId&sort`, shareable URLs    |
| `/products/[id]` | server               | `generateMetadata`, real 404 through `notFound()`       |
| `/login`         | server + client form | `?next=` return path, sanitised against open redirects  |
| `/register`      | server + client form | Creates the account and signs the user straight in      |
| `/profile`       | protected            | Middleware guards it, page re-checks the token          |
| `/health`        | route handler        | Liveness probe: plain `200 ok`, no cookies, no upstream |

Search, the category chips and the sort picker are one plain `GET` form plus links, so filtering
works with JavaScript disabled and every view has its own URL.

**Query parameters are validated before they are forwarded.** `product-service` runs
`forbidNonWhitelisted` with `@IsUUID()` on `categoryId` and an `@IsIn(...)` whitelist on `sort`, so a
hand-typed `?sort=cheapest` would come back as a 400 and leave the listing with nothing to show.
`src/lib/product-sort.ts` mirrors that whitelist and `uuidParam()` in `src/lib/url.ts` checks the id;
anything unrecognised is dropped, degrading to an unfiltered listing. The picker exposes the
shopper-facing subset (`name`, `priceCents`); `updatedAt:*` and `stock:*` are valid on the API and
still work by URL.

## Auth model (the part worth reading)

- Tokens live in **httpOnly cookies** (`access_token`, `refresh_token`), `sameSite=lax`, `path=/`,
  `secure` only in production. JavaScript in the page cannot read them, so an XSS bug cannot steal
  the session.
- Cookie lifetimes are derived from each token's own `exp` claim (falling back to 15m / 7d). The JWT
  is **decoded, never verified**, here - signature checking belongs to the services, and this app
  holds no JWT secret at all.
- `src/middleware.ts` performs the **silent refresh**. When the 15-minute access cookie is gone but
  the 7-day refresh cookie is still there, it calls `POST /auth/refresh`, writes the rotated pair
  onto the response and mutates the request cookies so the render that follows already sees the new
  token. Refreshing inside a Server Component render is impossible (Next.js forbids cookie writes
  there) and would be _harmful_: the refresh token is single-use, so a rotation that cannot be
  persisted logs the user out.
- `withAccessToken()` in `src/lib/auth/session.ts` is the refresh-on-401 helper for Server Actions,
  which _are_ allowed to write cookies.
- Signing out revokes the refresh token server-side before clearing the cookies - dropping the
  cookie alone would leave a valid token in circulation for another seven days.

### The refresh race (a real distributed-systems bug, kept visible on purpose)

A refresh token is **single-use**: `account-service` rotates it on every `/auth/refresh` and treats a
second presentation of the same token as theft, revoking every session that user has. Now count the
requests one navigation makes - the document, plus the RSC prefetches Next.js fires for each `<Link>`
in the header. They all pass through the middleware within milliseconds. Once the access cookie has
expired, every one of them carries the same refresh cookie, so the naive version of this middleware
POSTs the same token several times: the first call wins and the rest are read as a replay, which
revokes the family _including the pair just handed to the browser_. The user is silently signed out
of every device, and the trigger is ordinary prefetching rather than anything exotic. Two open tabs
reproduce it just as well.

The middleware therefore **memoises rotation by the token being spent** (`rotations` in
`src/middleware.ts`): concurrent callers share one in-flight POST, and a straggler still carrying the
old cookie is answered with the replacement pair for ten seconds rather than replaying a spent token.
Only a spent token is remembered: a refresh that fails because account-service is unreachable or
answers 5xx is not cached and does **not** clear the cookies, because "the service did not answer"
is not a verdict on the session - conflating the two turns a ten-second restart into a mass logout.

That is per-process state, and saying so matters more than the code: it is exactly right for one
frontend container and only best-effort beyond it. Scale the frontend to two replicas - stage 4 of
the roadmap - and the race is back between them, because the correct fix at that point is server
side: claim the row atomically (`updateMany` on `{ jti, revokedAt: null }`, count `0` means replay)
and answer a replay inside a short grace window with the pair that replaced it, instead of revoking
the family. Worth doing as an exercise once Kubernetes is in play.

### Failure states are not the same as signed-out

`loadSession()` returns `anonymous | authenticated | unavailable`, not `User | null`. Collapsing
"account-service could not answer" into "nobody is signed in" is what makes `/profile` redirect a
valid session to `/login`, whereupon the middleware - which only sees cookies, and they are still
valid - redirects it straight back: `ERR_TOO_MANY_REDIRECTS` every time the service is restarted.
So `/profile` throws to `error.tsx` on `unavailable` and only redirects on `anonymous`, the header
stays lenient (a storefront should not 500 because the profile service is down), and as a second
line of defence the middleware never bounces a `/login?next=...` request back to `/profile`.

## Layout

```
src/
  app/
    actions/          server actions (auth, profile) - zod validated
    products/         list + [id] detail
    login/ register/ profile/ health/
    layout.tsx page.tsx loading.tsx error.tsx not-found.tsx globals.css
  components/         server components by default; "use client" only for the forms
  lib/
    api/              client.ts (fetch + ApiError), account.ts, products.ts
    auth/             cookies.ts, jwt.ts, session.ts
    env.ts service-urls.ts format.ts types.ts url.ts validation.ts form-state.ts product-sort.ts
    *.test.ts         unit specs for the pure helpers, run by `node --test`
  middleware.ts
```

`src/lib/api/*` and `src/lib/auth/session.ts` import `server-only`, so pulling them into a client
component fails the build instead of leaking data into the browser bundle.

Configuration is read in exactly three modules, and the split is forced by the runtimes rather than
chosen: `lib/env.ts` is `server-only`, so the Edge middleware cannot import it. The two service URLs
therefore live in `lib/service-urls.ts` - no `server-only`, no Node API - which both `env.ts` and
`middleware.ts` import, and `lib/auth/cookies.ts` reads `NODE_ENV` for the same reason. Nothing else
touches `process.env`, so the fallback and the trailing-slash rule cannot drift apart.

## Environment

Copy `.env.example` to `.env.local` for standalone runs. Inside compose these come from the
repository root `.env`.

| Variable               | Purpose                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| `API_ACCOUNT_URL`      | account-service base URL (`http://account-service:3001` in compose) |
| `API_PRODUCT_URL`      | product-service base URL (`http://product-service:3002` in compose) |
| `NEXT_PUBLIC_SITE_URL` | Public origin used for metadata. **Baked in at build time**         |
| `PORT`                 | Port the server binds to (compose exposes it as `FRONTEND_PORT`)    |
| `NODE_ENV`             | `production` enables `secure` cookies                               |

`NEXT_PUBLIC_*` values are inlined into the client bundle by `next build`, so they are public by
definition - never put a secret behind that prefix. The Dockerfile takes it as a build arg.

## Local development (no Docker)

```bash
cp .env.example .env.local     # point the two API URLs at localhost:3001 / :3002
npm ci
npm run dev                    # http://localhost:3000
```

Both services need to be running for the catalogue and sign-in to work. With them down, `/` and
`/products` still render: the catalogue call is caught and degrades to an inline notice, so the
search box, the category chips and the sort picker stay usable and a retry is one reload away. A
storefront that answers 500 because one upstream is unhealthy fails its own availability budget.
`error.tsx` is the boundary for renders that genuinely cannot proceed - `/profile` throws to it when
account-service is unreachable (see the auth section above), and `/products/<id>` rethrows anything
that is not a 404.

## Scripts

| Script               | What it does                                     |
| -------------------- | ------------------------------------------------ |
| `npm run dev`        | Dev server with hot reload                       |
| `npm run build`      | Production build (`output: "standalone"`)        |
| `npm start`          | Serve the build                                  |
| `npm run lint`       | ESLint flat config (`next/core-web-vitals` + TS) |
| `npm run format`     | Prettier write / `format:check` to verify        |
| `npm run typecheck`  | `tsc --noEmit`                                   |
| `npm test`           | `typecheck`, then the unit specs - see below     |
| `npm run test:unit`  | Just the specs (`node --test`)                   |
| `npm run test:watch` | The specs, re-run on save                        |

**On `npm test`:** there is no test framework here, on purpose. The specs next to the modules they
cover (`src/lib/*.test.ts`) run on **Node's built-in runner** - `node --test` plus `node:assert` -
which needs no dependency in the lockfile, no config file and no install step in CI. Node 24 strips
the TypeScript types as it loads each file, so the specs are ordinary `.ts` and the type checker
still sees them; that is also why they import `./url.ts` **with** the extension, since Node resolves
the real filename and does no extension guessing (`allowImportingTsExtensions` in `tsconfig.json`
lets `tsc` accept that, which is safe because `noEmit` is on).

`npm test` runs `typecheck` first, so a type error still fails CI even if every assertion passes.

What is covered is the pure, side-effect-free half of `src/lib`: the `sort` whitelist, the query
parameter parsing and clamping, the open-redirect guard, the zod form schemas and the `priceCents`
money formatter. Everything that talks to a service or reads a cookie is left out - testing that
properly needs HTTP mocking, which is exactly the weight this setup avoids. Rendering the components
does need a real framework: adding Vitest + Testing Library for that is still a natural next
exercise, and the pure-function specs would move over unchanged.

## Docker

```bash
docker build -t learndev-frontend --build-arg NEXT_PUBLIC_SITE_URL=http://localhost .
```

Three stages on `node:24-alpine`: `npm ci` in `deps`, `next build` in `builder`, and a runner that
copies only `.next/standalone`, `.next/static` and `public`. It runs as the unprivileged `node` user
with `dumb-init` as PID 1 so `SIGTERM` actually reaches the server on `docker compose down`.
`next.config.ts` pins `outputFileTracingRoot` to this directory - without it a stray lockfile in a
parent directory makes Next nest the standalone output and the `COPY` silently produces an image
with no `server.js`.

The healthcheck lives in `docker-compose.yml`, not in the Dockerfile, so compose stays the single
source of truth for how the service is probed. It targets `/health`, which is a route handler that
returns a static `200` without touching cookies or either service - probing `/` instead would make
every 15-second liveness check server-render the landing page and call `product-service` twice.

## Troubleshooting

| Symptom                                         | Cause                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| "product-service is unreachable"                | The service is down, or `API_PRODUCT_URL` uses `localhost` inside Docker |
| Signed out again after ~15 minutes              | The refresh call failed - check account-service logs and `JWT_*` secrets |
| Sign-in works, then `/profile` bounces to login | Cookies were dropped: `secure: true` on plain HTTP, or a host mismatch   |
| Seeded credentials box missing on `/login`      | Intentional: it is hidden when `NODE_ENV=production`                     |
| Styles missing in Docker                        | `.next/static` was not copied into the runner stage                      |

## Deliberate omissions

No cart, no checkout, no client-side data fetching, no component library, no `next/font` (it fetches
from Google at build time, which breaks offline and air-gapped builds). Product images fall back to a
generated tile because the catalogue's image host is not known in advance and opening
`next/image` to arbitrary remote hosts is a classic SSRF footgun.
