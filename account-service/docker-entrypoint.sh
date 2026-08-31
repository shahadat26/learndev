#!/bin/sh
#
# Container entrypoint for account-service.
#
# Migrations run here, at container start, rather than being baked into the
# image or run by hand:
#
#   * `migrate deploy` only applies migration files that already exist and have
#     been committed. It never generates SQL and never prompts, which is exactly
#     what you want in an automated deploy. (`migrate dev` is the interactive
#     development command and must never run in a container.)
#   * It is idempotent: already-applied migrations are skipped, so restarts and
#     replica scale-ups are safe.
#   * Running it before the app starts guarantees the schema matches the code
#     that is about to serve traffic.
#
# `set -e` matters: if the migration fails we must exit non-zero so the
# orchestrator sees a failed container instead of an app running against a
# schema it does not understand.
set -e

# On a cold start Postgres can accept a TCP connection a moment before it is
# ready to serve queries, so the very first `migrate deploy` may lose that race
# even though compose waited for the healthcheck. A few retries absorb it.
#
# The retry is BOUNDED on purpose. Retrying forever would turn a permanent
# failure - bad SQL in a migration, wrong credentials, a database that will
# never come back - into a container that loops quietly and reports "starting"
# for ever. After the last attempt we fail loudly and exit non-zero, which is
# what makes the orchestrator restart or flag the container instead of leaving
# an app serving traffic against a schema that was never applied.
MIGRATE_MAX_ATTEMPTS=10
MIGRATE_RETRY_DELAY_SECONDS=3

attempt=1
while true; do
  echo "[entrypoint] applying database migrations (prisma migrate deploy), attempt ${attempt}/${MIGRATE_MAX_ATTEMPTS}..."

  # Running the command as an `if` condition exempts it from `set -e`, so a
  # failed attempt lands in the retry logic below instead of killing the shell.
  if npx prisma migrate deploy; then
    break
  fi

  if [ "${attempt}" -ge "${MIGRATE_MAX_ATTEMPTS}" ]; then
    echo "[entrypoint] migrations still failing after ${MIGRATE_MAX_ATTEMPTS} attempts; giving up" >&2
    exit 1
  fi

  echo "[entrypoint] migration attempt ${attempt} failed; retrying in ${MIGRATE_RETRY_DELAY_SECONDS}s" >&2
  attempt=$((attempt + 1))
  sleep "${MIGRATE_RETRY_DELAY_SECONDS}"
done

echo "[entrypoint] migrations applied; starting account-service"

# `exec` replaces this shell with the node process, so node inherits PID and
# receives SIGTERM directly. Without it, signals would stop at the shell and
# Nest's shutdown hooks would never run.
exec "$@"
