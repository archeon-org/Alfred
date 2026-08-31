FROM postgres:17.11-alpine3.24

COPY --chmod=0755 init/01-create-databases.sh /docker-entrypoint-initdb.d/01-create-databases.sh
COPY init/02-extensions.sql /docker-entrypoint-initdb.d/02-extensions.sql
