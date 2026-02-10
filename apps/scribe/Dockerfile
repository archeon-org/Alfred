# ==============================================================================
# Archeon Scribe - Production Dockerfile
# ==============================================================================
# Multi-stage build for optimized production image
# Includes Tesseract OCR, Poppler (PDF tools), and Python dependencies
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Builder
# ------------------------------------------------------------------------------
FROM python:3.11-slim-bookworm AS builder

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
WORKDIR /app
COPY pyproject.toml ./
RUN pip install --upgrade pip && \
    pip install . --no-deps && \
    pip install .

# ------------------------------------------------------------------------------
# Stage 2: Runtime
# ------------------------------------------------------------------------------
FROM python:3.11-slim-bookworm AS runtime

# Labels
LABEL maintainer="Archeon Team" \
    version="1.0.0" \
    description="Archeon Scribe - Document Processing Microservice"

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PATH="/opt/venv/bin:$PATH" \
    # Tesseract settings
    TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # PostgreSQL client library
    libpq5 \
    # Tesseract OCR
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-fra \
    tesseract-ocr-deu \
    tesseract-ocr-spa \
    tesseract-ocr-ara \
    # Poppler (PDF tools: pdftotext, pdftoppm)
    poppler-utils \
    # Image processing
    libmagic1 \
    # ImageMagick for HEIC/HEIF conversion
    imagemagick \
    libheif-dev \
    # Security updates
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Create non-root user for security
RUN groupadd --gid 1000 scribe \
    && useradd --uid 1000 --gid scribe --shell /bin/bash --create-home scribe

# Set working directory
WORKDIR /app

# Copy application code
COPY --chown=scribe:scribe src/ ./src/
COPY --chown=scribe:scribe pyproject.toml ./

# Create directories for logs and temp files
RUN mkdir -p /app/logs /app/tmp \
    && chown -R scribe:scribe /app

# Switch to non-root user
USER scribe

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/api/health/live', timeout=5)" || exit 1

# Expose API port
EXPOSE 8000

# Default command - use gunicorn with uvicorn workers for production concurrency
# For API server: docker run with CMD override or use docker-compose
# For workers: docker run with CMD ["celery", "-A", "src.core.celery_app", "worker", "-l", "info"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--limit-concurrency", "1000", "--timeout-keep-alive", "5", "--backlog", "2048"]
