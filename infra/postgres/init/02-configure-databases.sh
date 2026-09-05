#!/usr/bin/env sh
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"

assert_required_extension_inventory() {
  missing_extensions=$(psql --username "$POSTGRES_USER" --dbname postgres \
    --tuples-only --no-align --set=ON_ERROR_STOP=1 <<'SQL'
WITH required(name) AS (
  VALUES
    ('btree_gin'),
    ('btree_gist'),
    ('citext'),
    ('ltree'),
    ('pg_trgm'),
    ('pgcrypto'),
    ('vector')
)
SELECT string_agg(required.name, ', ' ORDER BY required.name)
FROM required
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_available_extensions AS available
  WHERE available.name = required.name
  UNION ALL
  SELECT 1
  FROM pg_amop AS object
  WHERE object.oid >= 16384
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend AS dependency
      WHERE dependency.classid = 'pg_amop'::regclass
        AND dependency.objid = object.oid
        AND dependency.refclassid = 'pg_extension'::regclass
        AND dependency.deptype = 'e'
    )
  UNION ALL
  SELECT 1
  FROM pg_amproc AS object
  WHERE object.oid >= 16384
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend AS dependency
      WHERE dependency.classid = 'pg_amproc'::regclass
        AND dependency.objid = object.oid
        AND dependency.refclassid = 'pg_extension'::regclass
        AND dependency.deptype = 'e'
    )
);
SQL
  )

  if [ -n "$missing_extensions" ]; then
    printf >&2 'Required PostgreSQL extensions are unavailable: %s.\n' "$missing_extensions"
    echo >&2 'Start the pinned pgvector PostgreSQL image before running bootstrap; no retained state was mutated.'
    exit 1
  fi

  available_vector_version=$(psql --username "$POSTGRES_USER" --dbname postgres \
    --tuples-only --no-align --set=ON_ERROR_STOP=1 <<'SQL'
SELECT default_version
FROM pg_available_extensions
WHERE name = 'vector';
SQL
  )

  if [ "$available_vector_version" != "0.8.6" ]; then
    printf >&2 'Available vector extension version %s is incompatible with pinned version 0.8.6.\n' \
      "$available_vector_version"
    echo >&2 'Replace the PostgreSQL image through the reviewed backup/upgrade procedure; no retained state was mutated.'
    exit 1
  fi
}

assert_retained_vector_version() {
  psql --username "$POSTGRES_USER" --dbname alfred_langgraph --set=ON_ERROR_STOP=1 <<'SQL'
DO $block$
DECLARE
  installed_version text;
BEGIN
  SELECT extension.extversion
  INTO installed_version
  FROM pg_extension AS extension
  WHERE extension.extname = 'vector';

  IF installed_version IS NOT NULL AND installed_version <> '0.8.6' THEN
    RAISE EXCEPTION
      'retained vector extension version % is incompatible with pinned version 0.8.6; back up and perform an explicit reviewed extension upgrade',
      installed_version;
  END IF;
END
$block$;
SQL
}

install_api_extensions() {
  database_name=$1

  psql --username "$POSTGRES_USER" --dbname "$database_name" --set=ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS "citext";

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname NOT IN ('plpgsql', 'citext')
  ) THEN
    RAISE EXCEPTION 'unexpected extension found in API database; refusing to rewrite a retained database';
  END IF;

  IF (
    SELECT pg_get_userbyid(extension.extowner) <> current_user
      OR namespace.nspname <> 'public'
    FROM pg_extension AS extension
    JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace
    WHERE extension.extname = 'citext'
  ) THEN
    RAISE EXCEPTION 'citext must be owned by bootstrap role % in schema public; refusing to rewrite a retained database',
      current_user;
  END IF;
END
$block$;
SQL
}

install_agent_extensions() {
  psql --username "$POSTGRES_USER" --dbname alfred_langgraph --set=ON_ERROR_STOP=1 <<'SQL'
-- The bootstrap administrator owns extensions that require elevated installation privileges.
-- This blocks direct ALTER/DROP EXTENSION by alfred_agent. The agent still owns its database and
-- public schema for managed runtime migrations, so protect that credential and keep backups.
CREATE EXTENSION IF NOT EXISTS "btree_gin" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "citext" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "ltree" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA public;

DO $block$
DECLARE
  invalid_extension text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname NOT IN (
      'plpgsql',
      'btree_gin',
      'btree_gist',
      'citext',
      'ltree',
      'pg_trgm',
      'pgcrypto',
      'vector'
    )
  ) THEN
    RAISE EXCEPTION 'unexpected extension found in alfred_langgraph; refusing to rewrite a retained database';
  END IF;

  SELECT extension.extname
  INTO invalid_extension
  FROM pg_extension AS extension
  JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname IN (
    'btree_gin',
    'btree_gist',
    'citext',
    'ltree',
    'pg_trgm',
    'pgcrypto',
    'vector'
  )
    AND (
      pg_get_userbyid(extension.extowner) <> current_user
      OR namespace.nspname <> 'public'
    )
  ORDER BY extension.extname
  LIMIT 1;

  IF invalid_extension IS NOT NULL THEN
    RAISE EXCEPTION 'extension % must be owned by bootstrap role % in schema public; refusing to rewrite a retained database',
      invalid_extension,
      current_user;
  END IF;
END
$block$;
SQL
}

assert_blob_extensions() {
  psql --username "$POSTGRES_USER" --dbname alfred_blobs --set=ON_ERROR_STOP=1 <<'SQL'
DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname <> 'plpgsql'
  ) THEN
    RAISE EXCEPTION 'unexpected extension found in alfred_blobs; refusing to rewrite a retained database';
  END IF;
END
$block$;
SQL
}

protect_agent_extension_schema() {
  psql --username "$POSTGRES_USER" --dbname alfred_langgraph --set=ON_ERROR_STOP=1 \
    --set=agent_role=alfred_agent \
    --set=bootstrap_role="$POSTGRES_USER" <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(
  hashtextextended('alfred:postgres-bootstrap:' || current_database(), 0)
);

ALTER SCHEMA public OWNER TO :"bootstrap_role";

SELECT format(
  'REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %I CASCADE',
  namespace.nspname,
  grantee.rolname
)
FROM pg_namespace AS namespace
CROSS JOIN LATERAL aclexplode(namespace.nspacl) AS privilege
JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee
WHERE namespace.nspname = 'public'
  -- OID 0 is the pseudo-role PUBLIC and has no pg_roles row. Its privileges are revoked by the
  -- explicit statement below instead of being formatted as a nullable SQL identifier here.
  AND privilege.grantee <> 0
  AND privilege.grantee <> namespace.nspowner
GROUP BY namespace.nspname, grantee.rolname
\gexec

REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC CASCADE;
GRANT USAGE, CREATE ON SCHEMA public TO :"agent_role";
COMMIT;
SQL
}

configure_application_database() {
  database_name=$1

  psql --username "$POSTGRES_USER" --dbname "$database_name" --set=ON_ERROR_STOP=1 \
    --set=bootstrap_role="$POSTGRES_USER" \
    --set=migration_role=alfred_migrator \
    --set=runtime_role=alfred_api <<'SQL'
-- Upgrade retained development volumes that previously made alfred_api the owner.
REASSIGN OWNED BY :"runtime_role" TO :"migration_role";

-- Some older volumes created application objects through the bootstrap role. Transfer only
-- non-extension objects from the public application schema; extension ownership stays untouched.
SELECT format(
  CASE c.relkind
    WHEN 'S' THEN 'ALTER SEQUENCE %I.%I OWNER TO %I'
    WHEN 'v' THEN 'ALTER VIEW %I.%I OWNER TO %I'
    WHEN 'm' THEN 'ALTER MATERIALIZED VIEW %I.%I OWNER TO %I'
    ELSE 'ALTER TABLE %I.%I OWNER TO %I'
  END,
  n.nspname,
  c.relname,
  :'migration_role'
)
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  AND pg_get_userbyid(c.relowner) = :'bootstrap_role'
  AND NOT EXISTS (
    SELECT 1
    FROM pg_depend AS dependency
    WHERE dependency.classid = 'pg_class'::regclass
      AND dependency.objid = c.oid
      AND dependency.deptype = 'e'
  )
\gexec

SELECT format(
  'ALTER FUNCTION %I.%I(%s) OWNER TO %I',
  n.nspname,
  procedure.proname,
  pg_get_function_identity_arguments(procedure.oid),
  :'migration_role'
)
FROM pg_proc AS procedure
JOIN pg_namespace AS n ON n.oid = procedure.pronamespace
WHERE n.nspname = 'public'
  AND pg_get_userbyid(procedure.proowner) = :'bootstrap_role'
  AND NOT EXISTS (
    SELECT 1
    FROM pg_depend AS dependency
    WHERE dependency.classid = 'pg_proc'::regclass
      AND dependency.objid = procedure.oid
      AND dependency.deptype = 'e'
  )
\gexec

SELECT format('ALTER TYPE %I.%I OWNER TO %I', n.nspname, type.typname, :'migration_role')
FROM pg_type AS type
JOIN pg_namespace AS n ON n.oid = type.typnamespace
WHERE n.nspname = 'public'
  AND type.typrelid = 0
  AND pg_get_userbyid(type.typowner) = :'bootstrap_role'
  AND NOT EXISTS (
    SELECT 1
    FROM pg_depend AS dependency
    WHERE dependency.classid = 'pg_type'::regclass
      AND dependency.objid = type.oid
      AND dependency.deptype = 'e'
  )
\gexec

ALTER SCHEMA public OWNER TO :"migration_role";

REVOKE ALL PRIVILEGES ON SCHEMA public FROM :"runtime_role";
GRANT USAGE ON SCHEMA public TO :"runtime_role";

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"runtime_role";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM :"runtime_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"runtime_role";

ALTER DEFAULT PRIVILEGES FOR ROLE :"bootstrap_role" IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM :"runtime_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"bootstrap_role" IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM :"runtime_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"bootstrap_role" IN SCHEMA public
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM :"runtime_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"bootstrap_role" IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TYPES FROM :"runtime_role";

ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_role" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"runtime_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_role" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"runtime_role";
SQL
}

assert_retained_vector_version
install_api_extensions alfred_app
install_api_extensions alfred_test
protect_agent_extension_schema
install_agent_extensions
assert_blob_extensions

configure_application_database alfred_app
configure_application_database alfred_blobs
configure_application_database alfred_test
