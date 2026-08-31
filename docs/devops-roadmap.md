# DevOps learning roadmap

This repository is the substrate, not the lesson. The lesson is the six stages
below: take one running system and push it, one capability at a time, from
"works on my laptop" to "operable by someone who has never met me".

Work them in order. Each stage assumes the previous one is done and green, and
each ends with a check you can actually run.

| Stage                         | You can already… | You will learn to…                              |
| ----------------------------- | ---------------- | ----------------------------------------------- |
| 1. Docker Compose             | run code locally | run the whole system reproducibly               |
| 2. CI with GitHub Actions     | run it           | prove every change still works                  |
| 3. Registry + image tagging   | prove it         | ship an immutable, identifiable artifact        |
| 4. Kubernetes                 | ship it          | run it declaratively, with real scheduling      |
| 5. Observability              | run it           | know what it is doing and when it is wrong      |
| 6. Infrastructure as Code     | operate it       | recreate the entire environment from a git repo |

---

## Stage 1 — Docker Compose (this repository)

**Goal:** one command brings up a full, healthy system on any machine with
Docker, and nothing about it depends on your shell history.

**Concepts:** images vs containers, layer caching, multi-stage builds, non-root
users, PID 1 and signal handling, named volumes vs bind mounts, user-defined
networks and DNS, healthchecks and `depends_on: condition: service_healthy`,
12-factor configuration, reverse proxying and path-based routing.

### Exercises

1. **Read the whole stack.** Run `docker compose config` and diff the resolved
   output against `docker-compose.yml`. Find every place a `${VAR}` got
   substituted. Now delete `.env` and run it again — read the warnings carefully;
   that is what a missing variable looks like in production.
2. **Prove the network boundaries.** These must behave exactly like this:
   ```bash
   docker compose exec frontend        sh -c 'wget -qO- http://account-service:3006/health'  # works
   docker compose exec frontend        sh -c 'nc -z postgres 5432 && echo up || echo blocked' # blocked
   docker compose exec account-service sh -c 'nc -z postgres 5432 && echo up || echo blocked' # up
   ```
   Then explain *why* the middle one fails, in one sentence, without using the
   word "firewall".
3. **Break the startup order.** Comment out the `depends_on` block on
   `account-service`, `docker compose up` from scratch, and watch the migration
   fail against a database that is not listening yet. Put it back. You now know
   what `condition: service_healthy` buys.
4. **Measure your layer cache.** Time `docker compose build account-service`.
   Touch a file in `src/`, rebuild, and time it again. Then touch
   `package.json`, rebuild, and time it a third time. Explain the difference by
   pointing at specific `COPY` lines in the Dockerfile.
5. **Shrink an image.** `docker image ls learndev/*`. Try to cut 20% off one of
   them (`.dockerignore` hygiene, fewer files copied into the runner stage,
   `npm ci --omit=dev`). Record the before/after numbers.
6. **Kill things.** `docker compose kill -s SIGKILL postgres`, then watch
   `docker compose ps` and the API logs. Does the service recover on its own
   when Postgres comes back? Should it? What does `restart: unless-stopped`
   actually do — and not do?
7. **Add a container without editing Traefik.** Add a `traefik/whoami` service
   to `docker-compose.yml` with labels routing `/api/whoami` to it, then
   `docker compose up -d whoami`. It should answer within seconds, with **no
   restart of the router** — that is dynamic configuration.
   Now try the same thing with a bare `docker run` and matching labels: it will
   *not* be picked up. Find out why in `infra/traefik/traefik.yml` (hint: the
   docker provider's `constraints` line limits discovery to this compose
   project) and decide whether you would keep that constraint in production.

**Done when:** a colleague clones the repo, runs three commands, and reaches a
working shop — with no help from you.

---

## Stage 2 — Continuous integration with GitHub Actions

**Goal:** every push is independently verified by a machine that has none of
your local state. Red main is an emergency; green main is the default.

**Concepts:** workflow triggers, jobs vs steps, matrices, caching, job
dependencies and fan-in, artifacts, required status checks, secrets vs
variables, least-privilege `permissions`.

Start from the workflow already in `.github/workflows/ci.yml`. Four jobs are
there already, and it pays to know exactly what each one gates before you change
anything:

| job                | what it actually proves                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality` (×3)     | each project installs from its lockfile, lints, is Prettier-clean, passes its specs and builds — and, for the two Nest services, that `prisma/migrations/0_init/migration.sql` still matches `prisma/schema.prisma` |
| `compose`          | both compose files resolve with the committed `.env.example`, and nothing but Traefik publishes a host port                                               |
| `images`           | all three Dockerfiles still build, with layer caching in the Actions cache. Nothing is pushed — that is stage 3                                            |
| `stack`            | the system actually **runs**: `docker compose up --build --wait`, seed both databases, then `make smoke` against Traefik on port 80, and dump the logs if any of it fails |

The migration-drift check inside `quality` is the one worth studying. There is
no database in CI, so both `0_init/migration.sql` files are maintained by hand
next to their schema; edit the schema, forget the migration, and every other
check here stays green while the container dies at start-up in production shape.
The job regenerates the SQL with `prisma migrate diff --from-empty` and requires
a match. Ask yourself which of *your* files have no such check.

### Exercises

1. **Make it fail on purpose.** Introduce a lint error, push, and read the log
   from the top. Then a failing test. Then a type error that lint does not
   catch. Note which job caught what — that is your safety net's actual shape.
2. **Speed it up.** Record the total wall-clock time. Now cut it: is `npm ci`
   cache-hitting (look for "Cache restored")? Are the three matrix legs really
   running in parallel? Should `images` still wait for `quality`? Target a 30%
   reduction and write down what you changed.
3. **Add coverage as a gate.** Run `npm run test:cov`, upload
   `coverage/lcov-report` with `actions/upload-artifact`, then fail the job when
   coverage drops below a threshold you choose. Argue with yourself about the
   number.
4. **Add a real database job.** Add a `services: postgres:17-alpine` block to a
   new job, run `prisma migrate deploy` against it, and run an integration test
   that actually writes a row. Notice how much slower and how much more
   trustworthy it is than the mocked e2e spec.
5. **Protect the branch.** In repo settings, require the `quality` and `compose`
   checks to pass before merging, and require a PR. Then try to push straight to
   `main` and watch it bounce.
6. **Lint the plumbing too.** Add `hadolint` for the three Dockerfiles and
   `actionlint` for the workflows. Fix everything they find.
7. **Cache-poisoning thought experiment.** Your workflow runs on
   `pull_request`. What could a fork's PR do with a `pull_request_target`
   trigger and `permissions: write-all`? Write the answer in a comment above
   your `permissions:` block.

**Done when:** you trust the badge more than you trust yourself.

---

## Stage 3 — Image registry and tagging

**Goal:** stop building on the machine that runs the code. A deploy becomes
"pull this exact digest", and you can always answer "what commit is in prod?"

**Concepts:** registries (GHCR/Docker Hub/ECR), immutable tags vs floating tags,
digests (`@sha256:…`), semantic versioning, multi-arch builds with buildx,
OCI labels, SBOM and provenance attestation, vulnerability scanning, retention.

`.github/dependabot.yml` is already the input side of this stage: weekly PRs for
the three npm trees, for the `node:24-alpine` base image in each Dockerfile, and
for the workflow's own actions. An artifact is only as trustworthy as what went
into it, and each of those PRs runs the whole CI workflow, so "can we upgrade?"
is answered by a pipeline rather than by a meeting. Note what it does *not*
watch: the `postgres:17-alpine` and `traefik:v3.3` pins in `docker-compose.yml`.
Exercise 5 below is the same loop seen from the other end.

### Exercises

1. **Push to GHCR.** Extend the `images` job with `docker/login-action` using
   the built-in `GITHUB_TOKEN` and `packages: write` permission. Push to
   `ghcr.io/<you>/learndev-account-service`.
2. **Tag properly with metadata-action.** Emit, from one build: the branch name,
   `sha-<short>`, `latest` on the default branch only, and `v1.2.3` +
   `v1.2` + `v1` on a git tag. Then answer: which of those may a production
   manifest reference, and why is `latest` not one of them?
3. **Deploy by digest.** Point `docker-compose.yml` at
   `image: ghcr.io/…@sha256:…` instead of a local build, and drop the `build:`
   block into a `docker-compose.build.yml`. This is the moment build and run
   become separate concerns.
4. **Stamp provenance.** Add OCI labels — `org.opencontainers.image.revision`,
   `.source`, `.created`, `.version` — and verify with
   `docker inspect`. From a running container you should be able to reach the
   exact commit that produced it.
5. **Scan and be honest.** Add Trivy or Grype to CI. Fail the build on HIGH and
   CRITICAL. Now fix, waive with a documented reason, or bump the base image —
   an ignore file with no comments is technical debt with a bow on it.
6. **Go multi-arch.** Build `linux/amd64,linux/arm64` with QEMU. Time it, then
   time it again with a matrix over platforms and a merged manifest list.
7. **Reproducibility check.** Build the same commit twice. Are the digests
   equal? If not, find what is non-deterministic (timestamps? `npm install`
   ordering? a `RUN apk upgrade`?).

**Done when:** you can name, for any running container, the commit, the build
run, and the CVE report that let it out the door.

---

## Stage 4 — Kubernetes

**Goal:** describe the desired state; let a scheduler maintain it. Compose's
`depends_on` becomes probes; `restart: unless-stopped` becomes a controller.

**Concepts:** Pods, Deployments, Services, Ingress, ConfigMaps and Secrets,
liveness/readiness/startup probes, resource requests and limits, QoS, rolling
updates and `maxUnavailable`, Jobs and init containers, StatefulSets and PVCs,
HPA, NetworkPolicies, RBAC and ServiceAccounts, Kustomize or Helm.

Use kind, k3d, minikube, or Docker Desktop's built-in cluster. Local is fine.

### Exercises

1. **Translate one service by hand.** Write `Deployment` + `Service` for
   `product-service` in raw YAML — no generators. Map every compose concept:
   `environment` → env/ConfigMap, `healthcheck` → readinessProbe,
   `restart` → the controller itself. Explain what has no equivalent.
2. **Probes, done right.** Wire `/health` to `livenessProbe` and
   `/health/ready` to `readinessProbe`. Then deliberately wire both to
   `/health/ready`, stop Postgres, and watch the pods CrashLoop instead of
   merely going NotReady. That is the lesson of stage 1's health split, at scale.
3. **Migrations without a race.** Three replicas must not each run
   `prisma migrate deploy`. Move it into a `Job` (or an init container guarded
   by a lock) and make the Deployment wait. Scale to 3 and prove only one
   migration ran.
4. **Config and secrets.** ConfigMap for `LOG_LEVEL` and the URLs; Secret for
   the JWT secrets and `DATABASE_URL`. Then find out for yourself that a Secret
   is base64, not encryption, and read about Sealed Secrets or External Secrets.
5. **Ingress instead of Traefik labels.** Recreate the exact routing table from
   `docs/architecture.md` as an `Ingress` (Traefik or ingress-nginx), including
   the `/api` strip via annotation or middleware CRD. Same URLs, same behaviour.
6. **Stateful Postgres.** A `StatefulSet` with a `volumeClaimTemplate`. Delete
   the pod. Does the data survive? Delete the StatefulSet. Does the PVC?
7. **Rolling update with zero dropped requests.** Put a load generator on
   `/api/products`, change the image tag, and watch. Any 502s? Add
   `readinessProbe`, `maxUnavailable: 0`, `terminationGracePeriodSeconds`, and
   `preStop`. Get to zero errors and explain each knob's contribution.
8. **Enforce the boundary.** A `NetworkPolicy` that lets only the two API pods
   reach Postgres. Prove it from a frontend pod's shell. Compare with the
   `internal: true` network in `docker-compose.yml` — same idea, real enforcement.
9. **Limits and eviction.** Set requests/limits. Then set a memory limit below
   what Node actually uses and watch the OOMKill. Read `kubectl describe pod`
   until you can spot it in three seconds.

**Done when:** `kubectl apply -k overlays/dev` produces the same shop as
`docker compose up`, and you can explain every difference.

---

## Stage 5 — Observability

**Goal:** answer "is it healthy?", "why is it slow?", and "what happened at
14:03?" from evidence rather than from a hunch. Logs, metrics, traces.

**Concepts:** structured logging and correlation IDs, the RED and USE methods,
Prometheus scraping and PromQL, cardinality, histograms and true percentiles,
distributed tracing with OpenTelemetry, dashboards, SLIs/SLOs/error budgets,
alerting on symptoms rather than causes.

The services already emit structured JSON via nestjs-pino with request-ID
correlation, and Traefik emits JSON access logs. That is your raw material.

### Exercises

1. **Follow one request end to end.** Log in through the UI, then find every log
   line for that one request across Traefik, frontend and account-service using
   the request ID. If you cannot, propagate the header until you can.
2. **Ship the logs.** Add Loki + Promtail (or OpenSearch) and Grafana. Query:
   all 5xx in the last hour, grouped by service.
3. **Expose metrics.** Add `prom-client` and a `/metrics` endpoint to both
   services: request count, duration histogram, in-flight gauge. Scrape with
   Prometheus.
4. **RED dashboard.** One Grafana panel row per service: **R**ate, **E**rrors,
   **D**uration p50/p95/p99. Then answer: why is a p99 from an average
   fundamentally impossible to compute?
5. **The cardinality trap.** Add a `user_id` label to a counter. Watch
   Prometheus memory. Remove it. Write down the rule you just learned.
6. **Trace across the boundary.** Instrument with OpenTelemetry, export to
   Tempo or Jaeger, and get a single trace spanning browser → Traefik →
   frontend → account-service → Postgres. Find the slowest span. It is almost
   never the one you guessed.
7. **Write an SLO.** "99% of `GET /api/products` under 300 ms over 30 days."
   Compute the error budget, build the burn-rate alert, then break the service
   with `tc` or a `pg_sleep` and watch it fire.
8. **Alert on symptoms.** Delete any alert that pages on "CPU > 80%". Replace it
   with one that pages on user-visible failure. Argue the case for both.

**Done when:** during an incident you reach for a dashboard, not for
`docker compose logs -f`.

---

## Stage 6 — Infrastructure as Code

**Goal:** the environment itself is a reviewable artifact. No console clicking,
no undocumented resource, no "don't touch that box".

**Concepts:** declarative vs imperative, providers, state files and locking,
plan/apply, drift, modules, workspaces and environments, immutable
infrastructure, secret management, policy as code, GitOps.

### Exercises

1. **Terraform the cluster.** Provision a small managed Kubernetes cluster (or
   a local `kind` cluster via the kind provider) with Terraform. Run
   `terraform plan` twice — the second must be empty. If it is not, you have
   drift on day one.
2. **Read the state.** Inspect `terraform.tfstate`. Find a secret in it. Now go
   configure a remote backend with locking and encryption, and explain to
   yourself why the local file was never acceptable.
3. **Modularise.** Extract a `network` module and a `cluster` module with
   variables and outputs. Instantiate `dev` and `staging` from the same modules
   with different sizes.
4. **Cause drift on purpose.** Change something by hand in the cloud console.
   Run `plan`. Watch Terraform want it back. Decide whether the answer is
   `apply`, `import`, or a code change — and why the console change was the bug.
5. **Managed database.** Replace the Postgres container with a managed instance
   defined in Terraform. Feed the connection string to Kubernetes through a
   Secret. Never let it touch a git-tracked file.
6. **Configuration with Ansible.** Provision a VM and configure it (Docker,
   users, the compose stack) with an idempotent playbook. Run it twice; the
   second run must report zero changes.
7. **GitOps.** Install Argo CD or Flux, point it at a `k8s/` directory, and
   deploy by merging a PR. Then change a Deployment with `kubectl edit` and
   watch it get reverted. That is a feature.
8. **Policy as code.** Add `tflint` + `tfsec`/Checkov to CI, and an OPA/Kyverno
   policy that rejects any Pod running as root or without resource limits. Try
   to deploy a violating manifest.
9. **The real exam: destroy and rebuild.** `terraform destroy`, then rebuild the
   entire environment from git alone. Time it. Everything you had to do by hand
   is a gap in your IaC — go close it, and time it again.

**Done when:** losing the whole environment is a scheduling inconvenience, not
an incident.

---

## How to use this

- One stage at a time; do not skip to Kubernetes because it is on the CV.
- Keep a running `NOTES.md` with what broke and what fixed it. The debugging is
  the education; the YAML is just where it lives.
- After each exercise, ask: *what would this look like at 3 a.m. with a pager
  going off?* If the answer is "I would have no idea", the stage is not done.
