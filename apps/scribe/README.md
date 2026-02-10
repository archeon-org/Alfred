# Archeon Scribe (Python)

A production-grade document processing microservice built with **FastAPI** and **Celery**, designed to replace the NestJS scribe service. This service handles:

- 📄 **OCR Text Extraction** - Tesseract-based OCR for images and PDFs
- 🤖 **AI Classification** - Document categorization using LLaMA via Fireworks AI
- 🧠 **Knowledge Graph** - Graphiti-powered entity extraction and semantic search via Neo4j
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
│  │ - GraphRAG  │  │ - GraphRAG  │  │ - GraphRAG  │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │   PostgreSQL + Neo4j         │
        │   - Documents (PostgreSQL)   │
        │   - Knowledge Graph (Neo4j)  │
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
| `NEO4J_URI` | Neo4j bolt URI | `bolt://neo4j-archeon:7687` |
| `NEO4J_USER` | Neo4j user | `neo4j` |
| `NEO4J_PASSWORD` | Neo4j password | `archeon123` |
| `FIREWORKS_API_KEY` | Fireworks AI API key | Required for AI features |
| `INTERNAL_API_KEY` | Gate ↔ Scribe auth | Must match Gate's key |

### Cloudflare R2 (File Storage)

| Variable | Description |
|----------|-------------|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | Bucket name |
| `R2_PUBLIC_URL` | Public bucket URL |

## Running Locally (Without Docker)

If you prefer running Scribe directly on your machine:

### 1. Prerequisites

- Python 3.11+
- Tesseract OCR installed
- Poppler for PDF processing
- PostgreSQL, Redis, and Neo4j running (or via Docker)

### 2. Install System Dependencies

**macOS:**
```bash
brew install tesseract poppler
# Optional: additional language packs
brew install tesseract-lang
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y tesseract-ocr tesseract-ocr-eng tesseract-ocr-fra poppler-utils imagemagick
```

### 3. Start Infrastructure

```bash
# From project root - start only databases
docker-compose -f docker/docker-compose.local.yml up -d postgres-archeon redis-archeon neo4j-archeon
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
NEO4J_URI=bolt://localhost:7687
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
5. Knowledge graph ingestion (Graphiti)
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

### Task: `ingest_document_to_graph`

Ingest document into Graphiti knowledge graph:

```python
from tasks.graphiti import ingest_document_to_graph

ingest_document_to_graph.delay({
    "documentId": "uuid",
    "userId": "uuid",
    "documentName": "Invoice from Acme",
    "content": "extracted text content...",
    "referenceTime": None  # Optional ISO datetime
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

## Monitoring

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
- `scribe.tasks.graphiti.ingest_document_to_graph`

## Troubleshooting

### Common Issues

**OCR not working:**
```bash
# Verify Tesseract installation
tesseract --version
tesseract --list-langs

# Check poppler for PDF support
pdftoppm -v
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
