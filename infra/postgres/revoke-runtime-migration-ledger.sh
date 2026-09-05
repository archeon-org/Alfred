#!/usr/bin/env sh
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"

psql --username "$POSTGRES_USER" --dbname alfred_app --set=ON_ERROR_STOP=1 \
  --set=runtime_role=alfred_api <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(
  hashtextextended('alfred:postgres-runtime-grants:' || current_database(), 0)
);

DO $block$
BEGIN
  IF to_regclass('public.migrations') IS NULL THEN
    RAISE EXCEPTION 'public.migrations does not exist; the migration job must complete first';
  END IF;
END
$block$;

REVOKE ALL PRIVILEGES ON TABLE public.migrations FROM :"runtime_role";
COMMIT;
SQL
