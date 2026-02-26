FROM python:3.11-slim-bookworm AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app
COPY apps/scribe/pyproject.toml apps/scribe/README.md ./
RUN pip install --upgrade pip && \
    pip install . --no-deps && \
    pip install .

FROM python:3.11-slim-bookworm AS base

LABEL maintainer="Archeon Team" \
    version="1.0.0" \
    description="Archeon Scribe - Document Processing Microservice"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH=/app/src

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

COPY --from=builder /opt/venv /opt/venv

RUN groupadd --gid 1000 scribe \
    && useradd --uid 1000 --gid scribe --shell /bin/bash --create-home scribe

WORKDIR /app

COPY --chown=scribe:scribe apps/scribe/src/ ./src/
COPY --chown=scribe:scribe apps/scribe/pyproject.toml ./

RUN mkdir -p /app/logs /app/tmp \
    && chown -R scribe:scribe /app

USER scribe

FROM base AS api

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/api/health/live', timeout=5)" || exit 1

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--limit-concurrency", "1000", "--timeout-keep-alive", "5", "--backlog", "2048"]

FROM base AS worker

HEALTHCHECK --interval=30s --timeout=15s --start-period=30s --retries=3 \
    CMD celery -A core.celery_app inspect ping || exit 1

CMD ["python", "-m", "worker"]
