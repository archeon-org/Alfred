#!/usr/bin/env sh
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${MIGRATOR_DATABASE_PASSWORD:?MIGRATOR_DATABASE_PASSWORD is required}"
: "${API_DATABASE_PASSWORD:?API_DATABASE_PASSWORD is required}"
: "${AGENT_DATABASE_PASSWORD:?AGENT_DATABASE_PASSWORD is required}"

ensure_login_role() {
  role_name=$1
  role_password=$2

  psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
    --set=role_name="$role_name" --set=role_password="$role_password" <<'SQL'
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
  :'role_name',
  :'role_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role_name')
\gexec
SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
  :'role_name',
  :'role_password'
)
\gexec
SQL
}

ensure_database() {
  database_name=$1
  owner_name=$2
  exists=$(psql --username "$POSTGRES_USER" --dbname postgres --tuples-only --no-align \
    --command "SELECT 1 FROM pg_database WHERE datname = '$database_name'")

  if [ "$exists" != "1" ]; then
    createdb --username "$POSTGRES_USER" --maintenance-db postgres \
      --owner "$owner_name" "$database_name"
  fi

  psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
    --set=database_name="$database_name" --set=owner_name="$owner_name" <<'SQL'
SELECT format('ALTER DATABASE %I OWNER TO %I', :'database_name', :'owner_name')
\gexec
SELECT format('REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC', :'database_name')
\gexec
SELECT format(
  'GRANT CONNECT, CREATE, TEMPORARY ON DATABASE %I TO %I',
  :'database_name',
  :'owner_name'
)
\gexec
SQL
}

grant_runtime_access() {
  database_name=$1
  role_name=$2

  psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
    --set=database_name="$database_name" --set=role_name="$role_name" <<'SQL'
SELECT format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I', :'database_name', :'role_name')
\gexec
SELECT format(
  'GRANT CONNECT, TEMPORARY ON DATABASE %I TO %I',
  :'database_name',
  :'role_name'
)
\gexec
SQL
}

ensure_login_role alfred_migrator "$MIGRATOR_DATABASE_PASSWORD"
ensure_login_role alfred_api "$API_DATABASE_PASSWORD"
ensure_login_role alfred_agent "$AGENT_DATABASE_PASSWORD"

ensure_database alfred_app alfred_migrator
ensure_database alfred_blobs alfred_migrator
ensure_database alfred_langgraph alfred_agent
ensure_database alfred_test alfred_migrator

grant_runtime_access alfred_app alfred_api
grant_runtime_access alfred_blobs alfred_api
grant_runtime_access alfred_test alfred_api
