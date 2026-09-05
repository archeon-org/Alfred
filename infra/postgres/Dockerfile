FROM postgres:17.11-alpine3.24@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73

COPY --chmod=0755 init/01-create-databases.sh /docker-entrypoint-initdb.d/01-create-databases.sh
COPY --chmod=0755 init/02-configure-databases.sh /docker-entrypoint-initdb.d/02-configure-databases.sh
