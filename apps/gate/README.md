# Archeon Gate (NestJS API Gateway)

The main API gateway for Archeon, built with **NestJS** and **TypeScript**. Gate handles:

- 🔐 **Authentication** - JWT-based auth with Google OAuth support
- 📄 **Document Management** - Upload, organize, and manage documents
- 🔍 **Search** - Hybrid semantic + keyword chunk retrieval
- 🧠 **Second Brain Q&A** - AI-powered question answering from your documents
- 📊 **User Management** - Profiles, subscriptions, and credits
- ⚡ **Rate Limiting** - Redis-backed request throttling

## Architecture

Gate is the public-facing API that coordinates between:
- **Mobile/Web clients** ← HTTP REST API → **Gate** ← Internal API → **Scribe (Python)**

```
┌─────────────────────┐
│   Mobile / Web      │
│   Applications      │
└──────────┬──────────┘
           │ JWT Auth + REST API
           ▼
┌─────────────────────┐      ┌─────────────────────┐
│   Gate (NestJS)     │─────▶│   Scribe (FastAPI)  │
│   Port: 3000        │      │   Port: 8000        │
│   - Auth            │      │   - OCR             │
│   - Documents CRUD  │      │   - AI Classification│
│   - Search          │      │   - Chunk RAG Index  │
└──────────┬──────────┘      └─────────────────────┘
           │
           ▼
┌─────────────────────┐
│   PostgreSQL        │
│   + Redis + pgvector│
└─────────────────────┘
```

## Quick Start (Docker - Recommended)

The easiest way to run Gate is using Docker Compose from the project root:

```bash
# From the archeon root directory
cd /path/to/archeon

# Start all services with hot reload
yarn docker:dev

# View Gate logs
docker logs -f archeon-gate
```

This starts Gate with hot reload enabled - changes to `apps/gate/src/` auto-restart the server.

**Access Points:**
- http://localhost:3000/api - API endpoints
- http://localhost:3000/docs - Swagger documentation

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
| `DATABASE_USERNAME` | Database user | `postgres` |
| `DATABASE_PASSWORD` | Database password | `postgres` |
| `DATABASE_NAME` | Database name | `postgres` |
| `REDIS_HOST` | Redis host | `redis-archeon` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password | `RedisPassword123` |
| `ACCESS_TOKEN_SECRET` | JWT signing secret | Generate a secure value |
| `FIREWORKS_API_KEY` | For AI search features | Get from fireworks.ai |
| `INTERNAL_API_KEY` | Gate ↔ Scribe auth | Must match Scribe's key |
| `SCRIBE_API_URL` | Scribe API URL | `http://archeon-scribe-api:8000` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `SWAGGER_ENABLED` | Enable Swagger | `true` |
| `DOCS_USER` | Swagger auth user | - |
| `DOCS_PASSWORD` | Swagger auth password | - |

## Running Locally (Without Docker)

If you prefer running Gate directly on your machine:

### 1. Prerequisites

- Node.js 20+
- Yarn 1.22+
- PostgreSQL running locally (or via Docker)
- Redis running locally (or via Docker)

### 2. Start Infrastructure

```bash
# From project root - start only databases
docker-compose -f docker/docker-compose.local.yml up -d postgres-archeon redis-archeon
```

### 3. Install Dependencies

```bash
# From project root
yarn install

# Build shared packages (required)
yarn build:packages
```

### 4. Configure Environment

```bash
cd apps/gate
cp .env.example .env
```

Edit `.env` for local development:
```bash
DATABASE_HOST=localhost
DATABASE_PORT=5432
REDIS_HOST=localhost
REDIS_PORT=6378  # Note: Docker exposes Redis on 6378
```

### 5. Run Database Migrations

```bash
cd apps/gate
npm run migration:run
```

### 6. Start Development Server

```bash
cd apps/gate
npm run start:dev
```

The server starts with hot reload at http://localhost:3000

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start with hot reload |
| `npm run start:debug` | Start with debugger |
| `npm run build` | Build for production |
| `npm run start:prod` | Run production build |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run E2E tests |
| `npm run test:cov` | Run tests with coverage |
| `npm run migration:run` | Run database migrations |
| `npm run migration:generate` | Generate new migration |
| `npm run migration:revert` | Revert last migration |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |

## Database Migrations

### Generate a New Migration

After modifying entities in `@archeon-org/database`:

```bash
# Rebuild the database package
yarn workspace @archeon-org/database build

# Generate migration
npm run migration:generate db/migrations/YourMigrationName
```

### Run Migrations

```bash
# In Docker
docker exec -it archeon-gate sh -c "cd apps/gate && npm run migration:run"

# Locally
npm run migration:run
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/google` | Google OAuth login |
| GET | `/api/auth/me` | Get current user |

### Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/documents/upload/ai` | Upload with AI processing |
| GET | `/api/documents` | List user documents |
| GET | `/api/documents/:id` | Get single document |
| PATCH | `/api/documents/:id` | Update document |
| DELETE | `/api/documents/:id` | Delete document |

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search` | Semantic/hybrid search |
| POST | `/api/search/chat` | Chat-based search |
| GET | `/api/search/graph` | Knowledge graph search |
| POST | `/api/search/question` | Second Brain Q&A |

## Troubleshooting

### "Cannot find module @archeon-org/..."

Rebuild shared packages:
```bash
yarn build:packages
```

### Database connection refused

Ensure PostgreSQL is running:
```bash
docker exec -it postgres-archeon pg_isready -U postgres
```

### Redis connection refused

Ensure Redis is running:
```bash
docker exec -it redis-archeon redis-cli -a RedisPassword123 ping
```

### Port 3000 already in use

Find and kill the process:
```bash
lsof -i :3000
kill -9 <PID>
```

## License

UNLICENSED - Archeon Organization
