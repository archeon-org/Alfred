#!/usr/bin/env sh
set -eu

create_database_if_missing() {
  database_name=$1
  exists=$(psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align \
    --set=database_name="$database_name" \
    --command "SELECT 1 FROM pg_database WHERE datname = :'database_name'")

  if [ "$exists" != "1" ]; then
    createdb --username "$POSTGRES_USER" --owner "$POSTGRES_USER" "$database_name"
  fi
}

create_database_if_missing alfred_test
create_database_if_missing alfred_langgraph
