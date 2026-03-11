# Scribe — Agentic RAG Architecture

> This document explains every component of the **agentic layer** inside the Scribe application.
> All source code lives under `apps/scribe/src/rag/`.

---

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [Data Types (`rag/types.py`)](#data-types)
3. [Embedding Client (`rag/embedding_client.py`)](#embedding-client)
4. [Chunk Repository (`rag/repositories/chunk_repository.py`)](#chunk-repository)
5. [Agents — Ingestion Pipeline](#agents--ingestion-pipeline)
   - [ContentPreparationAgent](#1-contentpreparationagent)
   - [ChunkingAgent](#2-chunkingagent)
   - [EmbeddingAgent](#3-embeddingagent)
   - [StorageAgent](#4-storageagent)
   - [QualityAgent](#5-qualityagent)
6. [Agents — Query Pipeline](#agents--query-pipeline)
   - [QueryRewriteAgent](#1-queryrewriteagent)
   - [HybridRetrieveAgent](#2-hybridretrieveagent)
   - [RerankAgent](#3-rerankagent)
   - [ContextAssemblyAgent](#4-contextassemblyagent)
   - [AnswerAgent](#5-answeragent)
7. [Orchestrators](#orchestrators)
   - [IngestionOrchestrator](#ingestionorchestrator)
   - [QueryOrchestrator](#queryorchestrator)
8. [Data Flow Diagrams](#data-flow-diagrams)
9. [Agent Modes](#agent-modes)
10. [Retry & Error Handling](#retry--error-handling)

---

## High-Level Overview

Scribe's agentic layer is a **multi-agent RAG (Retrieval-Augmented Generation)** system split into two distinct pipelines:

| Pipeline      | Purpose                                       | Agents                                                            |
| ------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| **Ingestion** | Index a document so it becomes searchable     | ContentPreparation → Chunking → Embedding → Storage → Quality     |
| **Query**     | Answer a user question from indexed documents | QueryRewrite → HybridRetrieve → Rerank → ContextAssembly → Answer |

Each pipeline is coordinated by an **Orchestrator** that calls agents in sequence and manages data flow between them. Agents are **single-responsibility classes** — each one does exactly one thing and returns a clean data structure to the next agent.

```
┌──────────────────────────────────────────────────────────────┐
│                       SCRIBE RAG MODULE                      │
│                                                              │
│  ┌──────────────────────┐    ┌──────────────────────────┐    │
│  │ IngestionOrchestrator│    │ QueryOrchestrator        │    │
│  │                      │    │                          │    │
│  │ ContentPreparation   │    │ QueryRewrite             │    │
│  │ Chunking             │    │ HybridRetrieve           │    │
│  │ Embedding            │    │ Rerank                   │    │
│  │ Storage              │    │ ContextAssembly          │    │
│  │ Quality              │    │ Answer                   │    │
│  └─────────┬────────────┘    └────────────┬─────────────┘    │
│            │                              │                  │
│            └──────────┬───────────────────┘                  │
│                       ▼                                      │
│              ┌────────────────┐    ┌───────────────────┐     │
│              │ ChunkRepository│    │ RagEmbeddingClient│     │
│              │  (PostgreSQL)  │    │  (Fireworks AI)   │     │
│              └────────────────┘    └───────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

---

## Data Types

**File:** `rag/types.py`

These are the shared data structures that flow between agents:

| Type                | Description                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `RagSearchMode`     | `"hybrid"` \| `"semantic"` \| `"keyword"` — controls which retrieval strategy is used             |
| `RagAgentMode`      | `"normal"` \| `"reasoning"` — controls depth of processing (see [Agent Modes](#agent-modes))      |
| `RagUserContext`    | User metadata (name, email, timezone, current date) injected into the LLM system prompt           |
| `PreparedContent`   | Output of `ContentPreparationAgent` — cleaned text + resolved title                               |
| `ChunkCandidate`    | Output of `ChunkingAgent` — one chunk with index, content, token count, offsets, and SHA-256 hash |
| `ChunkForIndexing`  | `ChunkCandidate` + embedding vector + model name — ready to be stored                             |
| `RetrievedChunk`    | A chunk fetched from the database during retrieval, with vector/keyword/merged scores             |
| `RagCitation`       | A citation reference linking a chunk to a snippet for the final answer                            |
| `DocumentSearchHit` | Groups chunks by document with a best snippet and top citations                                   |
| `RagAnswer`         | Final output: answer text, citations, confidence level, processing time, rewritten query          |
| `RagAgentEvent`     | Progress event emitted by the orchestrator (stage name + message + metadata)                      |

---

## Embedding Client

**File:** `rag/embedding_client.py`  
**Class:** `RagEmbeddingClient`

This is the **gateway to the AI provider** (Fireworks AI via an OpenAI-compatible API). It handles two core operations:

### `embed_texts(user_id, texts) → list[list[float]]`

- Calls the Fireworks embedding API with the configured model and dimensions.
- Handles embeddings returned as JSON arrays, base64-encoded floats, or native float lists.
- Validates each vector has the expected dimension count.

### `generate_answer(user_id, query, context, ...) → str`

- Builds a multi-message prompt for the LLM:
  1. **System message**: instructions to cite chunk IDs, be concise, handle temporal references, avoid secrets.
  2. **User context message** (optional): sanitized metadata like name, timezone, current date.
  3. **Conversation history** (last 6 messages): for multi-turn context.
  4. **User message**: the actual question + assembled context chunks.
- In **reasoning mode**: higher temperature (0.25 vs 0.1), more tokens (1600 vs 1200), deeper system instructions.
- Has built-in **retry logic** with exponential backoff for transient errors (rate limits, timeouts, 429/503).

### Singleton Pattern

`get_rag_embedding_client()` returns a lazily-initialized singleton instance so the OpenAI client is reused across requests.

---

## Chunk Repository

**File:** `rag/repositories/chunk_repository.py`

Manages all database interactions for document chunks in **PostgreSQL** (via SQLAlchemy).

### `ChunkRepository` (session-based, synchronous)

| Method                                         | Description                                                                                                                            |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `get_document_content(document_id, user_id)`   | Fetches a document's raw content, title, and original filename                                                                         |
| `get_existing_hashes(document_id)`             | Returns a map of `chunk_index → content_hash` for change detection                                                                     |
| `upsert_chunks(document_id, user_id, chunks)`  | Smart upsert: skips unchanged chunks (by hash), upserts modified ones, deletes orphaned chunks. Returns `(upserted, skipped, deleted)` |
| `delete_document_chunks(document_id, user_id)` | Removes all chunks for a document                                                                                                      |
| `fetch_backfill_candidates(batch_size)`        | Finds processed documents that have no chunks yet (for backfill jobs)                                                                  |

### Standalone async retrieval functions

| Function                                            | Description                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `vector_retrieve_chunks(user_id, embedding, limit)` | Cosine-similarity search against `pgvector` embeddings. Uses `1 - cosine_distance` as the score. |
| `fts_retrieve_chunks(user_id, query, limit)`        | Full-text search using PostgreSQL's `websearch_to_tsquery` + `ts_rank_cd` scoring                |

Both return `list[RetrievedChunk]` with document metadata (title, original name) joined from the `Document` table.

---

## Agents — Ingestion Pipeline

These 5 agents are called sequentially by `IngestionOrchestrator` to index a document.

### 1. ContentPreparationAgent

**File:** `rag/agents/content_preparation_agent.py`

**What it does:** Normalizes raw document content before chunking.

- Collapses all whitespace sequences into single spaces.
- Strips leading/trailing whitespace.
- Raises `ValueError` if the cleaned content is empty.
- Resolves a display title (falls back to `"Untitled document"` if title and original name are empty).

**Input:** Raw content string, title, original filename.  
**Output:** `PreparedContent(text, title, original_name)`

---

### 2. ChunkingAgent

**File:** `rag/agents/chunking_agent.py`

**What it does:** Splits prepared text into semantic chunks.

- Uses a `DocumentChunker` service with configurable `chunk_size` (default: 1400 chars) and `min_chunk_size` (default: 250 chars).
- For each chunk, computes:
  - **Token estimate**: `len(text) // 4` (rough approximation).
  - **Content hash**: SHA-256 of the normalized content — used by the storage agent to skip unchanged chunks during re-indexing.
- Empty chunks are filtered out.

**Input:** Prepared text, document name, document ID.  
**Output:** `list[ChunkCandidate]`

---

### 3. EmbeddingAgent

**File:** `rag/agents/embedding_agent.py`

**What it does:** Generates vector embeddings for every chunk.

- Processes chunks in **batches of 48** to avoid overwhelming the embedding API.
- Calls `RagEmbeddingClient.embed_texts()` per batch.
- Converts each `ChunkCandidate` into a `ChunkForIndexing` by attaching the embedding vector and model name.

**Input:** User ID, list of `ChunkCandidate`.  
**Output:** `list[ChunkForIndexing]`

---

### 4. StorageAgent

**File:** `rag/agents/storage_agent.py`

**What it does:** Persists embedded chunks to the database.

- Delegates to `ChunkRepository.upsert_chunks()` which performs:
  - **Hash-based deduplication**: if a chunk's content hash hasn't changed, skip the write.
  - **Upsert on conflict**: uses PostgreSQL `ON CONFLICT DO UPDATE` on `(documentId, chunkIndex)`.
  - **Orphan cleanup**: deletes chunks whose indices are no longer present (e.g., when a document shrinks).

**Input:** Repository, document ID, user ID, list of `ChunkForIndexing`.  
**Output:** `{ upserted: int, skipped: int, deleted: int }`

---

### 5. QualityAgent

**File:** `rag/agents/quality_agent.py`

**What it does:** Post-ingestion health check.

- Checks for two failure conditions:
  - **`zero_indexed`**: No chunks were produced at all.
  - **`low_coverage`**: Chunks were produced but none were upserted or matched existing data.
- Returns `status: True` only if both checks pass.

**Input:** Chunks, upsert/skip/delete counts.  
**Output:** `{ status, total_chunks, upserted, skipped, deleted, zero_indexed, low_coverage }`

---

## Agents — Query Pipeline

These 5 agents are called by `QueryOrchestrator` to search documents or answer questions.

### 1. QueryRewriteAgent

**File:** `rag/agents/query_rewrite_agent.py`

**What it does:** Cleans and optionally expands the user's query.

- **Whitespace normalization**: collapses and trims the query.
- **Short-query expansion**: if the query is very short (< 16 characters) and there's conversation history, it prepends the most recent user message for context. This helps with follow-up queries like "and this one?" or "how about that?".

**Input:** Raw query, optional conversation history.  
**Output:** Cleaned/expanded query string.

---

### 2. HybridRetrieveAgent

**File:** `rag/agents/hybrid_retrieve_agent.py`

**What it does:** Retrieves candidate chunks using vector search, keyword search, or both.

Depending on the `RagSearchMode`:

| Mode         | Vector Search | Keyword Search |
| ------------ | ------------- | -------------- |
| `"semantic"` | ✅            | ❌             |
| `"keyword"`  | ❌            | ✅             |
| `"hybrid"`   | ✅            | ✅             |

**Score merging** (for hybrid mode):

1. **Normalize** both vector and keyword scores to `[0, 1]` using min-max normalization.
2. **Weighted merge**: `0.7 × vector_score + 0.3 × keyword_score`.
3. **Title boost**: +0.03 if any significant query term appears in the document title or filename.
4. Clamp final score to `[0, 1]`.

The retrieval limit is expanded by **5×** to over-fetch, allowing the rerank stage to select the best candidates.

**Input:** User ID, query, search mode, limit.  
**Output:** `list[RetrievedChunk]` sorted by merged score (descending).

---

### 3. RerankAgent

**File:** `rag/agents/rerank_agent.py`

**What it does:** Reduces and diversifies the retrieved chunks.

- Sorts all chunks by `merged_score` (descending).
- Applies a **per-document cap of 4 chunks** — prevents one large document from dominating results.
- Selects up to `limit` total chunks.

**Input:** Chunks, limit.  
**Output:** `list[RetrievedChunk]` (slimmed down, diversified).

---

### 4. ContextAssemblyAgent

**File:** `rag/agents/context_assembly_agent.py`

**What it does:** Builds the final context string that gets injected into the LLM prompt.

- Iterates through reranked chunks adding them until a **token budget** is exceeded:
  - **normal mode**: 2,200 tokens.
  - **reasoning mode**: 3,600 tokens.
- Formats each chunk as: `- [chunk_id] Document Title :: snippet` (snippets capped at 320 chars).
- Produces both the text context and a list of `RagCitation` objects for the response.

**Input:** Chunks, max tokens.  
**Output:** `AssembledContext(context, citations, selected_chunks)`

---

### 5. AnswerAgent

**File:** `rag/agents/answer_agent.py`

**What it does:** Delegates to `RagEmbeddingClient.generate_answer()` to produce the final LLM response.

- A thin wrapper that passes query, context, conversation history, agent mode, and user context to the embedding client.
- The actual prompt engineering (system messages, temperature, etc.) lives in the embedding client.

**Input:** User ID, query, context string, conversation history, agent mode, user context.  
**Output:** Answer string.

---

## Orchestrators

### IngestionOrchestrator

**File:** `rag/orchestrators/ingestion_orchestrator.py`

Coordinates the full document indexing flow:

```
            ┌─────────────────────────────┐
            │ IngestionOrchestrator.run()  │
            └─────────────┬───────────────┘
                          │
         1. Fetch document content from DB
                          │
         2. ContentPreparationAgent.prepare()
                │ normalizes text, resolves title
                          │
         3. ChunkingAgent.chunk()
                │ splits into semantic chunks with hashes
                          │
         4. EmbeddingAgent.embed_chunks()   [async, batched]
                │ generates vector embeddings
                          │
         5. StorageAgent.store_chunks()
                │ upserts to DB, deduplicates by hash
                          │
         6. QualityAgent.assess()
                │ validates indexing health
                          │
         7. Return combined result
```

Returns a dict with: `document_id`, `user_id`, `title`, `original_name`, storage stats, and quality metrics.

---

### QueryOrchestrator

**File:** `rag/orchestrators/query_orchestrator.py`

Coordinates two operations: **document search** and **answer generation**.

#### `document_search()` — Find relevant documents

```
1. QueryRewriteAgent.rewrite()
         │
2. Build candidate queries (may include temporal hints, keyword fallback in reasoning mode)
         │
3. For each candidate query:
   │  HybridRetrieveAgent.retrieve()  [with retry]
   │  Collect all results
         │
4. Deduplicate chunks across rounds
         │
5. RerankAgent.rerank()
         │
6. Group by document → list[DocumentSearchHit]
```

#### `answer()` — Generate a grounded answer

```
1. QueryRewriteAgent.rewrite()  (with conversation history)
         │
2. Build candidate queries
         │
3. Multi-round retrieval (same as document_search)
         │
4. Deduplicate → RerankAgent.rerank()
         │
5. ContextAssemblyAgent.assemble()
         │
6. If no citations: return "no evidence" answer
         │
7. AnswerAgent.answer()  [with retry]
         │
8. Derive confidence level (high/medium/low)
         │
9. Return RagAnswer
```

**Key features:**

- **Multi-round retrieval**: in reasoning mode, up to 4 candidate queries are used (rewritten, temporal-augmented, original, keyword fallback).
- **Event emission**: every stage fires a `RagAgentEvent` via the `on_event` callback for real-time progress tracking.
- **Confidence scoring**: based on average merged scores, citation count, and score spread.
- **Retry with backoff**: transient errors (timeouts, rate limits, 429, 503) are retried up to 3 times with exponential backoff.

---

## Data Flow Diagrams

### Ingestion Flow

```
Raw Document
     │
     ▼
┌──────────────────┐
│ ContentPreparation│ ──→ PreparedContent (cleaned text + title)
└────────┬─────────┘
         ▼
┌──────────────────┐
│    Chunking      │ ──→ list[ChunkCandidate] (text + hash + offsets)
└────────┬─────────┘
         ▼
┌──────────────────┐
│    Embedding     │ ──→ list[ChunkForIndexing] (+ vector embeddings)
└────────┬─────────┘
         ▼
┌──────────────────┐
│    Storage       │ ──→ { upserted, skipped, deleted }
└────────┬─────────┘
         ▼
┌──────────────────┐
│    Quality       │ ──→ { status, health metrics }
└──────────────────┘
```

### Query Flow

```
User Question
     │
     ▼
┌──────────────────┐
│  QueryRewrite    │ ──→ cleaned/expanded query
└────────┬─────────┘
         ▼
┌──────────────────┐     ┌─────────┐     ┌─────────┐
│ HybridRetrieve   │ ──→ │ Vector  │  +  │ Keyword │  ──→ merged RetrievedChunks
└────────┬─────────┘     │ Search  │     │ Search  │
         │               └─────────┘     └─────────┘
         ▼
┌──────────────────┐
│    Rerank        │ ──→ diversified top-K chunks
└────────┬─────────┘
         ▼
┌──────────────────┐
│ ContextAssembly  │ ──→ AssembledContext (prompt-ready text + citations)
└────────┬─────────┘
         ▼
┌──────────────────┐
│    Answer        │ ──→ RagAnswer (text + citations + confidence)
└──────────────────┘
```

---

## Agent Modes

The system supports two operational modes controlled by `RagAgentMode`:

| Feature              | `"normal"`                        | `"reasoning"`                                       |
| -------------------- | --------------------------------- | --------------------------------------------------- |
| Retrieval limit      | `max(limit, 12)`                  | `max(limit × 2, 24)`                                |
| Candidate queries    | 1 (rewritten only)                | Up to 4 (rewritten + temporal + original + keyword) |
| Context token budget | 2,200                             | 3,600                                               |
| Rerank limit         | `limit`                           | `limit × 2`                                         |
| Answer temperature   | 0.1                               | 0.25                                                |
| Answer max tokens    | 1,200                             | 1,600                                               |
| LLM instructions     | "Prioritize speed and directness" | "Use deeper reasoning across multiple snippets"     |

**Reasoning mode** is designed for complex questions that require cross-referencing multiple documents.

---

## Retry & Error Handling

Both the `RagEmbeddingClient` and the `QueryOrchestrator` implement retry logic.

### Retryable errors

An error is considered retryable if its message or class name contains any of:

- `timeout`, `connection`, `temporarily unavailable`, `service unavailable`
- `too many requests`, `rate`, `429`, `503`

### Retry strategy

- **Max attempts**: 3
- **Backoff**: exponential — `0.25s × 2^(attempt-1)` → `0.25s`, `0.5s`, `1s`
- Non-retryable errors fail immediately.
- The last error is re-raised after all attempts are exhausted.

---

## File Reference

| File                                          | Purpose                                                    |
| --------------------------------------------- | ---------------------------------------------------------- |
| `rag/__init__.py`                             | Public API: exports orchestrators and embedding client     |
| `rag/types.py`                                | All shared data classes and type aliases                   |
| `rag/embedding_client.py`                     | Fireworks AI client for embeddings and LLM answers         |
| `rag/repositories/chunk_repository.py`        | PostgreSQL CRUD for document chunks + vector/FTS retrieval |
| `rag/agents/__init__.py`                      | Agent barrel export                                        |
| `rag/agents/content_preparation_agent.py`     | Text normalization                                         |
| `rag/agents/chunking_agent.py`                | Semantic text splitting                                    |
| `rag/agents/embedding_agent.py`               | Vector embedding generation                                |
| `rag/agents/storage_agent.py`                 | Database persistence                                       |
| `rag/agents/quality_agent.py`                 | Post-ingestion health check                                |
| `rag/agents/query_rewrite_agent.py`           | Query cleaning and expansion                               |
| `rag/agents/hybrid_retrieve_agent.py`         | Hybrid vector + keyword retrieval                          |
| `rag/agents/rerank_agent.py`                  | Result diversification                                     |
| `rag/agents/context_assembly_agent.py`        | Context formatting for LLM                                 |
| `rag/agents/answer_agent.py`                  | LLM answer generation                                      |
| `rag/orchestrators/ingestion_orchestrator.py` | Ingestion pipeline coordinator                             |
| `rag/orchestrators/query_orchestrator.py`     | Query pipeline coordinator                                 |
