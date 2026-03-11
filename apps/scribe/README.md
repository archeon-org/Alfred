# Archeon Scribe (Python)

A production-grade document processing microservice built with **FastAPI** and **Celery**, designed to replace the NestJS scribe service. This service handles:

- 📄 **OCR Text Extraction** - Mistral OCR for images and PDFs
- 🤖 **AI Classification** - Document categorization using LLaMA via Fireworks AI
- 🧠 **Chunk RAG** - pgvector + PostgreSQL chunk indexing with citation-based retrieval
- 📬 **Task Queue** - Redis-backed Celery for distributed processing

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐
│   Gate (NestJS)     │────▶│   Redis (Broker)    │
│   - API Gateway     │     │   - Celery Queue    │
│   - Task Producer   │     └──────────┬──────────┘
└─────────────────────┘                │
                                       ▼
┌─────────────────────────────────────────────────────────┐
│                 Scribe Workers (Python)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  Worker 1   │  │  Worker 2   │  │  Worker N   │      │
│  │ - OCR       │  │ - OCR       │  │ - OCR       │      │
│  │ - Classify  │  │ - Classify  │  │ - Classify  │      │
│  │ - Chunk RAG │  │ - Chunk RAG │  │ - Chunk RAG │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │          PostgreSQL          │
        │   - Documents                │
        │   - document_chunks (vector) │
        └──────────────────────────────┘
```

## Quick Start (Docker - Recommended)

The easiest way to run Scribe is using Docker Compose from the project root with **hot reload** enabled:

```bash
# From the archeon root directory
cd /path/to/archeon

# Start all services with hot reload
yarn docker:dev

# View Scribe logs
docker logs -f archeon-scribe-api
docker logs -f archeon-scribe-worker
```

This starts:
- **archeon-scribe-api** - FastAPI server with uvicorn hot reload (port 8000)
- **archeon-scribe-worker** - Celery worker with watchfiles hot reload

### Hot Reload in Docker

The Docker dev setup mounts your local source code into the containers:

| Service | Hot Reload Method | What It Watches |
|---------|-------------------|-----------------|
| Scribe API | `uvicorn --reload` | `/app/src/` directory |
| Scribe Worker | `watchfiles` | `/app/src/` directory (Python files) |

**How it works:**
- Your local `apps/scribe/src/` is mounted into the container
- Changes to `.py` files automatically restart the server/worker
- No need to rebuild the container for code changes!

**Access Points:**
- http://localhost:8000/api - API endpoints
- http://localhost:8000/docs - FastAPI auto documentation
- http://localhost:8000/api/health/live - Liveness probe

## Environment Variables

Copy the example and configure:

```bash
cp .env.example .env
```

### Required Variables

| Variable | Description | Docker Default |
|----------|-------------|----------------|
| `DATABASE_HOST` | PostgreSQL host | `postgres-archeon` |
| `DATABASE_PORT` | PostgreSQL port | `5432` |
| `DATABASE_NAME` | Database name | `postgres` |
| `DATABASE_USER` | Database user | `postgres` |
| `DATABASE_PASSWORD` | Database password | `postgres` |
| `REDIS_HOST` | Redis host | `redis-archeon` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password | `RedisPassword123` |
| `FIREWORKS_API_KEY` | Fireworks AI API key | Required for AI features |
| `MISTRAL_OCR_API_KEY` | Mistral OCR API key | Required for OCR |
| `INTERNAL_API_KEY` | Gate ↔ Scribe auth | Must match Gate's key |

### Cloudflare R2 (File Storage)

| Variable | Description |
|----------|-------------|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | Bucket name |
| `R2_PUBLIC_URL` | Public bucket URL |
| `MISTRAL_OCR_BASE_URL` | Mistral OCR API base URL |
| `MISTRAL_OCR_MODEL` | Mistral OCR model name |

## Running Locally (Without Docker)

If you prefer running Scribe directly on your machine:

### 1. Prerequisites

- Python 3.11+
- Mistral OCR API key
- PostgreSQL and Redis running (or via Docker)

### 2. Configure Mistral OCR

Set these values in `.env`:

```bash
MISTRAL_OCR_BASE_URL=https://api.mistral.ai/v1
MISTRAL_OCR_API_KEY=your_mistral_api_key
MISTRAL_OCR_MODEL=mistral-ocr-latest
```

### 3. Start Infrastructure

```bash
# From project root - start only databases
docker-compose -f docker/docker-compose.local.yml up -d postgres-archeon redis-archeon
```

### 4. Create Virtual Environment

```bash
cd apps/scribe

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -e ".[dev]"
```

### 5. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` for local development:
```bash
DATABASE_HOST=localhost
DATABASE_PORT=5432
REDIS_HOST=localhost
REDIS_PORT=6378  # Note: Docker exposes Redis on 6378
```

### 6. Run the Services

```bash
# Terminal 1: Start the API
python -m src.main

# Terminal 2: Start a Celery worker
celery -A src.core.celery_app worker -l info
```

The API starts at http://localhost:8000

## Configuration

All configuration is done via environment variables. See `.env.example` for the full list.

### Key Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `ENV` | Environment (development/staging/production) | `development` |
| `DATABASE_HOST` | PostgreSQL host | `postgres-archeon` |
| `DATABASE_PASSWORD` | PostgreSQL password | `postgres` |
| `REDIS_HOST` | Redis host | `redis-archeon` |
| `REDIS_PASSWORD` | Redis password | `RedisPassword123` |
| `FIREWORKS_API_KEY` | Fireworks AI API key | Required |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID | Required |
| `R2_ACCESS_KEY_ID` | R2 access key | Required |
| `R2_SECRET_ACCESS_KEY` | R2 secret key | Required |
| `WORKER_CONCURRENCY` | Celery worker concurrency | `2` |

## Celery Tasks

### Task: `process_document`

Full document processing pipeline:
1. Download file from R2
2. OCR text extraction
3. AI classification (category, tags, title)
4. Database update
5. Queue chunk indexing in pgvector
6. User notification

```python
# Task signature
process_document.delay({
    "documentId": "uuid",
    "userId": "uuid",
    "key": "documents/user-id/file.pdf",
    "originalName": "invoice.pdf"
})
```

### Task: `generate_title`

Generate AI title for a document:

```python
generate_title.delay({
    "documentId": "uuid",
    "userId": "uuid",
    "key": "documents/user-id/file.pdf",
    "originalName": "document.pdf"
})
```

### Task: `index_document`

Index document chunks into PostgreSQL pgvector:

```python
from tasks.rag import index_document

index_document.delay({
    "documentId": "uuid",
    "userId": "uuid",
    "manualTrigger": False
})
```

## API Endpoints

### Health Checks

| Endpoint | Description |
|----------|-------------|
| `GET /api/health/` | Full health status with checks |
| `GET /api/health/live` | Kubernetes liveness probe |
| `GET /api/health/ready` | Kubernetes readiness probe |

## Security Features

- ✅ **No pickle serialization** - JSON only for task data
- ✅ **Redis authentication** - Password-protected broker
- ✅ **TrustedHost middleware** - Production host validation
- ✅ **Non-root container** - Runs as unprivileged user
- ✅ **Secrets in environment** - No hardcoded credentials
- ✅ **Connection pooling** - Efficient database connections
- ✅ **Task acknowledgment** - Late ack for reliability

### Celery Flower (Optional)

```bash
# Install Flower
pip install flower

# Start Flower UI
celery -A scribe.core.celery_app flower --port=5555
```

Access at http://localhost:5555

### Structured Logging

All logs are structured JSON in production:

```json
{
  "event": "Task completed",
  "task_id": "abc-123",
  "document_id": "doc-456",
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "info"
}
```

## Development

### Running Tests

```bash
# Run all tests
pytest

# With coverage
pytest --cov=src/scribe --cov-report=html

# Specific test file
pytest tests/test_ocr.py -v
```

### Code Quality & Formatting

#### Using Make (Recommended)

```bash
# Format code
make format

# Check formatting without making changes
make format-check

# Run linter
make lint

# Auto-fix linting issues
make lint-fix

# Run type checker
make typecheck

# Run all checks (format, lint, typecheck)
make check
```

#### Using NPM scripts (from root)

```bash
# Format code
npm run format:scribe

# Check formatting
npm run format:scribe:check

# Run linter
npm run lint:scribe

# Auto-fix linting issues
npm run lint:scribe:fix

# Type checking
npm run typecheck:scribe
```

#### Using Python scripts directly

```bash
# Format code
python -m scribe.scripts.format

# Run all checks
python -m scribe.scripts.format check
```

#### Using Ruff directly

```bash
# Format code
ruff format src/ tests/

# Check formatting
ruff format --check src/ tests/

# Run linter
ruff check src/ tests/

# Auto-fix issues
ruff check --fix src/ tests/
```

#### Pre-commit Hooks

Install pre-commit hooks to automatically format and check code before commits:

```bash
# Install pre-commit hooks
pre-commit install

# Run hooks manually
pre-commit run --all-files
```

## Production Deployment

### Docker Build

```bash
# Build production image
docker build -t archeon-scribe:latest .

# Run API container
docker run -d \
  --name scribe-api \
  -p 8000:8000 \
  --env-file .env \
  archeon-scribe:latest

# Run Worker container
docker run -d \
  --name scribe-worker \
  --env-file .env \
  archeon-scribe:latest \
  python -m scribe.worker
```

### Scaling Workers

```bash
# Multiple workers with different hostnames
docker run -d --name worker-1 -e WORKER_HOST=worker-1 archeon-scribe python -m scribe.worker
docker run -d --name worker-2 -e WORKER_HOST=worker-2 archeon-scribe python -m scribe.worker
docker run -d --name worker-3 -e WORKER_HOST=worker-3 archeon-scribe python -m scribe.worker
```

## Integration with Gate (NestJS)

The Gate service needs to be updated to use `celery-node` to send tasks to this Python worker. See the Gate migration documentation for details.

Task names used by Gate:
- `scribe.tasks.document.process_document`
- `scribe.tasks.document.generate_title`
- `scribe.tasks.rag.index_document`
- `scribe.tasks.rag.delete_document_index`
- `scribe.tasks.rag.backfill_documents`

## Troubleshooting

### Common Issues

**OCR not working:**
```bash
# Verify Mistral OCR configuration
echo $MISTRAL_OCR_BASE_URL
echo $MISTRAL_OCR_MODEL
test -n "$MISTRAL_OCR_API_KEY" && echo "MISTRAL_OCR_API_KEY is set"
```

**Redis connection refused:**
```bash
# Verify Redis is running
redis-cli -a your_password ping
```

**Database connection failed:**
```bash
# Test PostgreSQL connection
psql -h localhost -U archeon -d archeon -c "SELECT 1"
```

## License

Private - Archeon Organization
