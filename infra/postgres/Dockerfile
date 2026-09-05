FROM pgvector/pgvector:0.8.6-pg17-trixie@sha256:724a4041afdb1750446e3f6b5cfa8f3b0ac5a2cf538ddfa6bfee4f94c2fa85c6

COPY --chmod=0755 init/01-create-databases.sh /docker-entrypoint-initdb.d/01-create-databases.sh
COPY --chmod=0755 init/02-configure-databases.sh /docker-entrypoint-initdb.d/02-configure-databases.sh
COPY --chmod=0755 revoke-runtime-migration-ledger.sh /usr/local/bin/revoke-runtime-migration-ledger.sh
