FROM pgvector/pgvector:0.8.6-pg17-trixie@sha256:724a4041afdb1750446e3f6b5cfa8f3b0ac5a2cf538ddfa6bfee4f94c2fa85c6

# Preserve PostgreSQL 17, glibc locales and the postgres UID for existing volumes.
# Apply distribution security updates without replacing the data-directory format.
# gosu is only used by the upstream entrypoint when started as root; this image
# starts directly as postgres and does not need the inherited Go executable.
RUN apt-get -o APT::Update::Error-Mode=any update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get purge -y --auto-remove gnupg gnupg-l10n dirmngr gpg gpg-agent gpgconf gpgsm \
    && apt-get purge -y mount \
    && test ! -e /bin/mount && test ! -e /bin/umount \
    && rm -rf /var/lib/apt/lists/* \
    && rm /usr/local/bin/gosu

COPY --chmod=0755 init/01-create-databases.sh /docker-entrypoint-initdb.d/01-create-databases.sh
COPY --chmod=0755 init/02-configure-databases.sh /docker-entrypoint-initdb.d/02-configure-databases.sh
COPY --chmod=0755 revoke-runtime-migration-ledger.sh /usr/local/bin/revoke-runtime-migration-ledger.sh

USER postgres
