# Archeon

> **Your AI-Powered Second Brain**  
> Transform documents into actionable insights with knowledge graphs, semantic search, and intelligent Q&A.

[![License](https://img.shields.io/badge/license-UNLICENSED-red.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/python-%3E%3D3.11-blue.svg)](https://python.org/)
[![TypeScript](https://img.shields.io/badge/typescript-%3E%3D5.0-blue.svg)](https://www.typescriptlang.org/)
[![Coverage All](.github/badges/coverage-all.svg)](.github/badges/coverage-all.svg)
[![Coverage Gate](.github/badges/coverage-gate.svg)](.github/badges/coverage-gate.svg)
[![Coverage Scribe](.github/badges/coverage-scribe.svg)](.github/badges/coverage-scribe.svg)
[![Coverage Native](.github/badges/coverage-native.svg)](.github/badges/coverage-native.svg)

---

## 🌟 Overview

Archeon is a full-stack document management and AI-powered knowledge platform that helps users organize, search, and extract insights from their documents. Built with modern technologies and powered by advanced Graph RAG (Retrieval-Augmented Generation), Archeon transforms your document library into an intelligent second brain.

### Key Features

- 📄 **Document Management** - Upload, organize, and manage PDFs, images, and documents with cloud storage (Cloudflare R2)
- 🔍 **Intelligent Search** - Semantic, keyword, and graph-based search powered by pgvector and Neo4j knowledge graphs
- 🧠 **Second Brain Q&A** - Ask questions and get AI-generated answers from your documents using LLaMA via Fireworks AI
- 🤖 **AI Classification** - Automatic document categorization and metadata generation powered by LLaMA
- 📊 **Knowledge Graph** - Entity extraction and relationship mapping using Graphiti + Neo4j for advanced RAG
- 🔐 **Secure & Scalable** - JWT authentication, rate limiting (Redis), and production-ready architecture
- 📱 **Mobile App** - Native React Native + Expo app for iOS and Android with offline support
- 🚀 **Microservices** - Distributed architecture with Gate (NestJS) and Scribe (FastAPI)
- ⚡ **Async Processing** - Celery-based distributed task queue for OCR, AI classification, and graph indexing
- 🔄 **Hot Reload** - Docker development environment with automatic code reloading for rapid development
- 🎯 **OCR Support** - Tesseract-powered text extraction from images and scanned documents

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend Layer                          │
├─────────────────────────┬───────────────────────────────────────┤
│   Web App (Next.js)     │   Mobile App (React Native/Expo)      │
│   - Dashboard           │   - Document scanning                 │
│   - Search UI           │   - Offline mode                      │
│   - Analytics           │   - Push notifications                │
└────────────┬────────────┴────────────────┬──────────────────────┘
             │                             │
             └──────────────┬──────────────┘
                            │ JWT Auth + REST API
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Gate API (NestJS + TypeScript)                │
│  - Authentication & Authorization                               │
│  - Rate Limiting (Redis)                                        │
│  - Document CRUD                                                │
│  - Search orchestration                                         │
│  - User management                                              │
└────────────┬────────────────────────────────────┬───────────────┘
             │                                    │
             │ Internal API Key                   │ PostgreSQL
             ▼                                    ▼
┌──────────────────────────────────┐   ┌──────────────────────────┐
│  Scribe API (FastAPI + Python)   │   │   PostgreSQL + pgvector  │
│  - Knowledge graph search         │   │   - Users & documents   │
│  - Q&A generation                 │   │   - Vector embeddings   │
│  - Entity management              │   │   - Metadata            │
└────────────┬─────────────────────┘   └──────────────────────────┘
             │
             │ Celery Tasks (Redis Broker)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Scribe Workers (Python + Celery)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Worker 1   │  │  Worker 2   │  │  Worker N   │              │
│  │ - OCR       │  │ - OCR       │  │ - OCR       │              │
│  │ - AI Class  │  │ - AI Class  │  │ - AI Class  │              │
│  │ - Graph     │  │ - Graph     │  │ - Graph     │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Data & AI Layer                             │
├──────────────────────┬──────────────────────┬───────────────────┤
│   Neo4j (Graphiti)   │  Cloudflare R2 (S3)  │  Redis            │
│   - Knowledge graph  │  - Document storage  │  - Cache          │
│   - Entities & facts │  - File uploads      │  - Rate limiting  │
│   - Relationships    │  - Thumbnails        │  - Task queue     │
└──────────────────────┴──────────────────────┴───────────────────┘
```

## 🚀 Getting Started from Zero

This guide will help you set up the entire Archeon platform locally using Docker with hot reload support. This is the **recommended approach** for development.

### Prerequisites

| Tool               | Version | Purpose                       |
| ------------------ | ------- | ----------------------------- |
| **Docker Desktop** | Latest  | Container runtime             |
| **Docker Compose** | v2.0+   | Multi-container orchestration |
| **Node.js**        | 20+     | For native app development    |
| **Yarn**           | 1.22+   | Package manager               |
| **Git**            | Latest  | Version control               |

> 💡 **Note**: PostgreSQL, Redis, and Neo4j will run inside Docker containers - no need to install them locally!

### Quick Start (Docker Development - Recommended)

This method runs all backend services (Gate, Scribe, databases) in Docker containers with hot reload enabled.

#### Step 1: Clone the Repository

```bash
git clone https://github.com/your-org/archeon.git
cd archeon
```

#### Step 2: Set Up Environment Variables

```bash
# Copy environment templates
cp apps/gate/.env.example apps/gate/.env
cp apps/scribe/.env.example apps/scribe/.env

# The .env.example files come with Docker-ready defaults:
# - Database hosts: postgres-archeon, redis-archeon, neo4j-archeon
# - Default passwords for local development
#
# You only need to add your API keys:
# - FIREWORKS_API_KEY (required for AI features)
# - R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (for file storage)
```

> ⚠️ **Important**:
>
> - The `.env` files are the **source of truth** - docker-compose.local.yml loads all configuration from them
> - You need a Fireworks AI API key for document classification and Q&A features. Get one at https://fireworks.ai
> - For local development, the `.env.example` files already have Docker-friendly defaults (postgres-archeon, redis-archeon, etc.)

#### Step 3: Start All Services with Docker

```bash
# Start all services (PostgreSQL, Redis, Neo4j, Gate, Scribe API, Scribe Worker)
yarn docker:dev

# Or with fresh rebuild
yarn docker:dev:build
```

This command starts:

**Core Services:**

- **postgres-archeon**: PostgreSQL 15 with pgvector extension (port 5432)
- **redis-archeon**: Redis 7 for caching, rate limiting, and Celery broker (port 6378)
- **neo4j-archeon**: Neo4j 5.26 Community with APOC plugin (ports 7474, 7687)
- **archeon-gate**: NestJS API Gateway with hot reload (port 3000)
- **archeon-scribe-api**: FastAPI processing service with hot reload (port 8000)
- **archeon-scribe-worker**: Celery worker with watchfiles hot reload for async document processing

#### Step 4: Wait for Services to be Ready

The first startup takes a few minutes to:

1. Pull Docker images
2. Install Node.js dependencies in the Gate container
3. Build shared packages
4. Install Python dependencies in Scribe containers

```bash
# Watch the logs to see when services are ready
yarn docker:dev:logs

# Or view specific service logs
docker logs -f archeon-gate
docker logs -f archeon-scribe-api
docker logs -f archeon-scribe-worker
```

Wait until you see:

- Gate: `Application is running on: http://[::1]:3000`
- Scribe API: `Uvicorn running on http://0.0.0.0:8000`
- Scribe Worker: `celery@scribe-worker-1 ready`

#### Step 5: Run Database Migrations

```bash
# Enter the Gate container and run migrations
docker exec -it archeon-gate sh -c "cd apps/gate && npm run migration:run"
```

#### Step 6: Verify Everything is Working

| Service                    | URL                        | Description                              |
| -------------------------- | -------------------------- | ---------------------------------------- |
| **Gate API**               | http://localhost:3000/api  | Main API Gateway                         |
| **Gate Docs**              | http://localhost:3000/docs | Swagger UI (auth required)               |
| **Scribe API**             | http://localhost:8000/api  | Document processing API                  |
| **Scribe Docs**            | http://localhost:8000/docs | FastAPI auto docs                        |
| **Neo4j Browser**          | http://localhost:7474      | Knowledge graph UI (neo4j/archeon123)    |

```bash
# Test Gate API
curl http://localhost:3000/api/health

# Test Scribe API
curl http://localhost:8000/api/health/live
```

### Hot Reload Development

The Docker dev setup enables **hot reload** for all services:

| Service       | Hot Reload Method     | Source Location               |
| ------------- | --------------------- | ----------------------------- |
| Gate          | NestJS `--watch` mode | Your local `apps/gate/src/`   |
| Scribe API    | uvicorn `--reload`    | Your local `apps/scribe/src/` |
| Scribe Worker | watchfiles + Celery   | Your local `apps/scribe/src/` |

**How it works:**

- Your local code is mounted into the containers
- Changes to `.ts` files in Gate automatically trigger recompilation
- Changes to `.py` files in Scribe automatically restart the server/worker
- No need to rebuild containers for code changes!

### Stopping & Restarting Services

```bash
# Stop all services (preserves data volumes)
yarn docker:dev:down

# Restart a specific service
docker restart archeon-gate
docker restart archeon-scribe-api
docker restart archeon-scribe-worker

# Full restart
yarn docker:dev:restart

# Stop and remove all data (fresh start)
docker-compose -f docker/docker-compose.dev.yml down -v
yarn docker:dev:build
```

### Alternative: Manual Local Development

If you prefer running services directly on your machine (not recommended for first-time setup):

<details>
<summary>Click to expand manual setup instructions</summary>

#### 1. Start Infrastructure Only

```bash
# Start only databases (PostgreSQL, Redis, Neo4j)
docker-compose -f docker/docker-compose.dev.yml up -d postgres-archeon redis-archeon neo4j-archeon
```

#### 2. Install Dependencies

```bash
# Install all workspace dependencies
yarn install

# Build shared packages
yarn build:packages
```

#### 3. Run Gate Locally

```bash
cd apps/gate
cp .env.example .env
# Edit .env: DATABASE_HOST=localhost, REDIS_HOST=localhost

npm run migration:run
npm run start:dev
```

#### 4. Run Scribe Locally

```bash
cd apps/scribe

# Create virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -e ".[dev]"

# Install system dependencies (macOS)
brew install tesseract poppler

# Copy and edit environment
cp .env.example .env
# Edit .env: DATABASE_HOST=localhost, REDIS_HOST=localhost, NEO4J_URI=bolt://localhost:7687

# Terminal 1: Run API
python -m src.main

# Terminal 2: Run Worker
celery -A src.core.celery_app worker -l info
```

</details>

### Running the Mobile App (Native)

The React Native mobile app requires Node.js and can run alongside the Docker services:

```bash
cd apps/native

# Install dependencies
yarn install

# Set up environment (point to local API)
# Edit app.config.ts or create .env with API_URL=http://localhost:3000

# Run on iOS Simulator
yarn ios

# Run on Android Emulator
yarn android

# Run Expo development server
yarn start:dev
```

See [apps/native/README.md](apps/native/README.md) for detailed mobile setup instructions.

### Troubleshooting

#### Services won't start

```bash
# Check if ports are in use
lsof -i :3000  # Gate
lsof -i :8000  # Scribe
lsof -i :5432  # PostgreSQL
lsof -i :6378  # Redis
lsof -i :7474  # Neo4j

# View container logs for errors
docker logs archeon-gate
docker logs archeon-scribe-api
```

#### Database migrations fail

```bash
# Wait for PostgreSQL to be fully ready
docker exec -it postgres-archeon pg_isready -U postgres

# Then run migrations
docker exec -it archeon-gate sh -c "cd apps/gate && npm run migration:run"
```

#### Hot reload not working

```bash
# Restart the specific container
docker restart archeon-gate

# Or rebuild the container
docker-compose -f docker/docker-compose.local.yml up -d --build gate
```

#### Clean restart

```bash
# Stop all containers and remove volumes
docker-compose -f docker/docker-compose.local.yml down -v

# Remove node_modules volumes
docker volume rm archeon_gate-node-modules archeon_gate-app-node-modules 2>/dev/null || true

# Fresh start
yarn docker:dev:build
```

---

## 📄 License

**UNLICENSED** - Proprietary software. All rights reserved.
