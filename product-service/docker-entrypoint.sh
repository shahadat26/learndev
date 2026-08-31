#!/bin/sh
# ---------------------------------------------------------------------------
# product-service container entrypoint
#
# Why run migrations here instead of baking them into the image or running them
# by hand?
#   * `prisma migrate deploy` only APPLIES migrations that already exist in
#     prisma/migrations. It never generates SQL and never prompts, which is what
#     makes it safe for an unattended production start (`migrate dev` is the
#     interactive, developer-only command and must never run in a container).
#   * It is idempotent: already-applied migrations are skipped, so restarts and
#     scaled-up replicas are harmless.
#   * Running it before the app starts means the process only begins serving
#     once the schema matches the code it was built from.
#
# `exec "$@"` replaces this shell with the app so the Node process becomes the
# child of PID 1 (dumb-init) and receives SIGTERM directly on `docker stop`.
# ---------------------------------------------------------------------------
set -e

# Postgres is often not accepting connections yet when this container starts.
# `depends_on: condition: service_healthy` narrows that window but does not close
# it - the first connection can still land while the database is replaying WAL,
# and a database restart reopens the window entirely. So retry.
#
# BOUNDED, not `while true`, and that is the whole point: an unbounded loop turns
# a permanent failure (wrong credentials, a migration whose SQL cannot apply)
# into a container that spins forever looking busy. Nothing ever reports it as
# broken, and `docker compose up --wait` hangs instead of failing. Ten attempts
# three seconds apart is ~30s of patience, after which we exit non-zero so the
# orchestrator sees a failed container rather than an app serving traffic
# against a schema that was never applied.
MIGRATE_MAX_ATTEMPTS=10
MIGRATE_RETRY_DELAY=3

attempt=1
while :; do
  echo "[entrypoint] applying database migrations (prisma migrate deploy), attempt ${attempt}/${MIGRATE_MAX_ATTEMPTS}"

  # `set -e` would abort the script on the first failure, so the command is
  # tested by `if` - inside a condition a non-zero exit is a value, not a fault.
  if npx prisma migrate deploy; then
    break
  fi

  if [ "${attempt}" -ge "${MIGRATE_MAX_ATTEMPTS}" ]; then
    echo "[entrypoint] FATAL: migrations still failing after ${MIGRATE_MAX_ATTEMPTS} attempts; refusing to start product-service" >&2
    exit 1
  fi

  echo "[entrypoint] migration attempt ${attempt} failed, retrying in ${MIGRATE_RETRY_DELAY}s" >&2
  attempt=$((attempt + 1))
  sleep "${MIGRATE_RETRY_DELAY}"
done

echo "[entrypoint] migrations applied, starting product-service"
exec "$@"
