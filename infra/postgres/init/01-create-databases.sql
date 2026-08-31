-- =============================================================================
-- Bootstrap the per-service databases.
--
-- The postgres image runs every file in /docker-entrypoint-initdb.d ONCE, the
-- first time it initialises an empty data directory, as the superuser named by
-- POSTGRES_USER and connected to POSTGRES_DB. If the pgdata volume already has
-- data, this file is NOT executed - use `make reset` to wipe the volume.
--
-- PostgreSQL has no `CREATE DATABASE IF NOT EXISTS`, and CREATE DATABASE may
-- not run inside a transaction or a DO block (it cannot be executed from
-- PL/pgSQL at all). The portable idiom is to have a SELECT build the DDL text
-- only when the database is missing, then let psql's \gexec run whatever rows
-- came back - zero rows means nothing happens, so re-running is safe.
--
-- Database names come from the container environment (ACCOUNT_DB_NAME /
-- PRODUCT_DB_NAME, set on the postgres service in docker-compose.yml) via
-- psql's \getenv, with the literals below as fallback defaults. Keep them in
-- sync with ACCOUNT_DATABASE_URL / PRODUCT_DATABASE_URL in .env.
-- =============================================================================

\set ON_ERROR_STOP on

-- Defaults; \getenv overwrites them only when the variable is present.
\set account_db 'account_db'
\set product_db 'product_db'
\getenv account_db ACCOUNT_DB_NAME
\getenv product_db PRODUCT_DB_NAME

\echo 'Bootstrapping databases:' :'account_db' 'and' :'product_db'

-- ---------------------------------------------------------------------------
-- account-service database
-- %I quotes the identifier safely; current_user is POSTGRES_USER, so each
-- database ends up owned by the application role rather than by postgres.
-- ---------------------------------------------------------------------------
SELECT format('CREATE DATABASE %I OWNER %I ENCODING ''UTF8''', :'account_db', current_user)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = :'account_db'
)
\gexec

-- ---------------------------------------------------------------------------
-- product-service database
-- ---------------------------------------------------------------------------
SELECT format('CREATE DATABASE %I OWNER %I ENCODING ''UTF8''', :'product_db', current_user)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = :'product_db'
)
\gexec

-- ---------------------------------------------------------------------------
-- Belt and braces: owning a database does not by itself grant CONNECT to a
-- role that was created later, and re-granting is idempotent.
-- ---------------------------------------------------------------------------
SELECT format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', :'account_db', current_user)
\gexec

SELECT format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', :'product_db', current_user)
\gexec

\echo 'Database bootstrap complete.'
