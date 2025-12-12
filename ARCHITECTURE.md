# 🏗️ RAG SYSTEM ARCHITECTURE

## **High-Level Overview**

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT / FRONTEND                     │
│         (Web app, API client, curl, Postman)            │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│                 EXPRESS.JS SERVER (v2)                   │
│         localhost:3000                                   │
│  ┌──────────────────────────────────────────────┐       │
│  │ GET  /health      POST /upload              │       │
│  │ POST /ask         GET  /stats               │       │
│  │ POST /clear                                 │       │
│  └──────────────────────────────────────────────┘       │
└────────────┬──────────┬──────────┬──────────────────────┘
             │          │          │
    ┌────────▼──┐  ┌────▼──────┐  ┌─────────▼────┐
    │ Embedding  │  │ Retriever  │  │ LLM Module   │
    │ Module     │  │ Module     │  │ (GPT)        │
    └────────┬───┘  └────┬──────┘  └──────┬──────┘
             │           │                │
             └───────────┼────────────────┘
                         ▼
         ┌───────────────────────────────┐
         │   DATABASE CONNECTION POOL    │
         │      (PostgreSQL Client)      │
         └───────────────┬───────────────┘
                         │
                         ▼
         ┌───────────────────────────────┐
         │  PostgreSQL 16 + pgvector     │
         │  localhost:5433               │
         │  ┌─────────────────────────┐  │
         │  │ documents               │  │
         │  │ chunks                  │  │
         │  │ chunk_embeddings        │  │
         │  │ retrieval_logs          │  │
         │  └─────────────────────────┘  │
         └───────────────────────────────┘
```

---

## **Component Architecture**

### **1. Server Layer (server-v2.ts)**
```
Responsibilities:
- HTTP request handling (Express)
- Route management
- Request/response validation
- Error handling
- CORS, middleware setup

Endpoints:
  GET  /health        → health check
  POST /upload        → process document
  POST /ask           → query RAG
  GET  /stats         → show stats
  POST /clear         → reset data
```

### **2. Database Layer (db.ts)**
```
Responsibilities:
- PostgreSQL connection pooling
- Query execution
- CRUD operations
- Vector similarity search
- Logging retrieval events

Key Functions:
  - insertDocument()         → save file metadata
  - insertChunks()           → save text chunks
  - insertEmbedding()        → save vectors
  - similaritySearch()       → find similar chunks
  - logRetrieval()           → audit trail
```

### **3. Embedding Layer (embedding.ts)**
```
Responsibilities:
- Document loading
- Smart chunking (para + sentence aware)
- OpenAI API calls
- Vector generation
- Database persistence

Pipeline:
  Load File
    ↓
  Chunk Text (500 token max)
    ↓
  Embed Chunks (OpenAI)
    ↓
  Save to PostgreSQL
```

### **4. Retrieval Layer (retriever-db.ts)**
```
Responsibilities:
- Vector similarity search
- Context building
- Relevance scoring
- Result formatting

Process:
  Question
    ↓
  Embed Question
    ↓
  Query Vector DB
    ↓
  Rank by Similarity
    ↓
  Build Context
```

### **5. LLM Layer (llm.ts)**
```
Responsibilities:
- OpenAI API integration
- System prompt management
- Response generation
- Token tracking

Features:
  - Multiple system prompts (policy, itsm)
  - Temperature control (0.7)
  - Max tokens limit (1000)
  - Usage tracking
  - Error handling
```

---

## **Data Flow**

### **Upload Document Flow**
```
POST /upload
  ↓
Load file from ./data
  ↓
insertDocument() → documents table
  ↓
chunkText() → Split into logical pieces
  ↓
insertChunks() → chunks table
  ↓
embedTexts() → Call OpenAI API
  ↓
insertEmbedding() → chunk_embeddings table (pgvector)
  ↓
Response: success + chunk count
```

### **Query Flow**
```
POST /ask {question}
  ↓
embedText(question) → OpenAI API
  ↓
similaritySearch() → pgvector cosine distance
  ↓
Top-K chunks with relevance scores
  ↓
buildContext() → Format chunks as prompt context
  ↓
generateAnswer() → Call GPT-4-turbo
  ├─ System Prompt (guardrails)
  ├─ Context (retrieved chunks)
  └─ Question
  ↓
logRetrieval() → audit trail
  ↓
Response: answer + sources + tokens
```

---

## **Database Schema**

### **documents**
```sql
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) UNIQUE,
  content TEXT,
  source_type VARCHAR(50),  -- policy, itsm, etc
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```
**Purpose:** Store original documents with metadata

---

### **chunks**
```sql
CREATE TABLE chunks (
  id SERIAL PRIMARY KEY,
  doc_id INT REFERENCES documents(id),
  chunk_order INT,
  text TEXT,
  token_count INT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(doc_id, chunk_order)
);
```
**Purpose:** Store text chunks (~500 tokens each)

---

### **chunk_embeddings**
```sql
CREATE TABLE chunk_embeddings (
  id SERIAL PRIMARY KEY,
  chunk_id INT UNIQUE REFERENCES chunks(id),
  embedding vector(1536),  -- OpenAI embedding
  model VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast search
CREATE INDEX idx_embedding ON chunk_embeddings 
  USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);
```
**Purpose:** Store vectors (1536 dims) + enable fast search

---

### **retrieval_logs**
```sql
CREATE TABLE retrieval_logs (
  id SERIAL PRIMARY KEY,
  question TEXT,
  retrieved_chunk_ids TEXT,  -- JSON array
  llm_model VARCHAR(50),
  answer TEXT,
  tokens_used INT,
  latency_ms INT,
  user_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);
```
**Purpose:** Audit trail + analytics

---

## **Vector Operations**

### **Embedding Process**
```
Text → OpenAI API → 1536-dimensional vector
Example:
  "Quy trình nghỉ phép"
  → [0.023, -0.145, 0.087, ..., 0.012]  (1536 numbers)
```

### **Similarity Search**
```
Query Vector vs All Document Vectors
  ↓
Cosine Similarity Formula:
  cos(A, B) = (A·B) / (||A|| × ||B||)
  Result: 0 (different) → 1 (identical)
  ↓
Sort by similarity
  ↓
Return top-K (default 5)
  ↓
Filter by threshold (default 0.3)
```

### **Index Strategy**
```
pgvector supports:
  - ivfflat: Fast, approximate
  - hnsw: Slower build, better recall

Current setup uses ivfflat with 100 lists
Tuning:
  - More lists → more accuracy, slower build
  - Fewer lists → faster build, less accuracy
```

---

## **Request Flow (Detailed)**

### **1. Upload Document**
```
Client Request:
  POST /upload
  {filename: "policy.md", sourceType: "policy"}
  
Server Processing:
  ✓ Validate filename
  ✓ Read file from ./data/
  ✓ Insert into documents table
  ✓ Chunk text (smart paragraph+sentence split)
  ✓ Insert chunks into chunks table
  ✓ Call OpenAI embedding API (batch)
  ✓ Insert embeddings into chunk_embeddings
  
Response:
  {status: "success", docId: 1, chunksCreated: 5}
```

### **2. Query System**
```
Client Request:
  POST /ask
  {question: "Quy trình?", topK: 5, minSimilarity: 0.3}
  
Server Processing:
  ✓ Validate question
  ✓ Embed question (OpenAI)
  ✓ Query pgvector:
    SELECT chunks, documents
    WHERE similarity >= 0.3
    ORDER BY similarity DESC
    LIMIT 5
  ✓ Build context from chunks
  ✓ Create prompt:
    [SYSTEM] "You are internal assistant..."
    [USER] "Context: [...chunks...]\n\nQuestion: Quy trình?"
  ✓ Call GPT-4-turbo
  ✓ Log to retrieval_logs
  
Response:
  {
    question: "Quy trình?",
    answer: "Quy trình gồm...",
    sources: [{filename, relevance}],
    llmUsage: {promptTokens, completionTokens}
  }
```

---

## **System Guarantees**

### **Consistency**
- Each chunk tied to document (foreign key)
- Each embedding tied to chunk (unique)
- Deletion cascades properly

### **Availability**
- Connection pooling (10 connections default)
- Timeout handling
- Graceful error responses

### **Latency**
- pgvector IVFFlat index: ~50ms for search
- OpenAI API: ~500ms per request
- LLM response: ~2-5s per query

### **Scalability**
- Vector store: ~1M vectors on single DB
- Concurrent: 10 connections, can tune up
- Sharding: Not needed until 10M+ vectors

---

## **Error Handling Strategy**

```
OpenAI API Error (quota)
  → Catch 429 error
  → Return "Quota exceeded, check billing"
  
Database Connection Error
  → Return 503 "Database disconnected"
  
Invalid Input
  → Return 400 "Validation failed"
  
Server Error
  → Log to retrieval_logs
  → Return 500 with error message
```

---

## **Performance Characteristics**

| Operation | Time | Scaling |
|-----------|------|---------|
| Document upload (100KB) | 2-3s | Linear with file size |
| Chunking | <100ms | Linear with chunks |
| Embedding batch (10 chunks) | 500ms | OpenAI API limited |
| Vector search | 50ms | Log(vectors) with index |
| LLM response | 2-5s | Depends on answer length |
| **Total query** | **3-8s** | Dominated by LLM |

---

## **Future Architecture Improvements**

### **Caching Layer**
```
Redis between server and OpenAI
  - Cache embeddings by hash
  - Cache LLM responses for common questions
  - Reduce API costs 40-60%
```

### **Async Processing**
```
Job Queue (Bull/RabbitMQ)
  - Process large documents in background
  - Batch embedding operations
  - Don't block user on upload
```

### **Hybrid Search**
```
BM25 (keyword search) + Vector search
  - 70% similarity: use both
  - Combine results, rerank
  - Better for specific terms
```

### **Multi-tenancy**
```
Organization isolation
  - Each org has own vector space
  - Row-level security in DB
  - Separate vector indexes
```

### **Monitoring Stack**
```
Prometheus → Metrics collection
Grafana → Visualization
ELK → Log aggregation
Sentry → Error tracking
```

---

## **Technology Stack**

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Node.js 20+ | JavaScript, async-friendly |
| Framework | Express.js | Lightweight, battle-tested |
| Language | TypeScript | Type safety, better DX |
| Database | PostgreSQL 16 | ACID, pgvector extension |
| Vector Search | pgvector | Native, no separate infra |
| Embeddings | OpenAI API | SOTA quality |
| LLM | GPT-4-turbo | Fast, good quality |
| Container | Docker | Easy deployment |
| Orchestration | Docker Compose | Simple multi-service setup |

---

## **Security Considerations**

### **Current**
- API keys in .env (not in code)
- Database credentials protected
- No input validation yet ⚠️

### **Needed**
- [ ] JWT authentication
- [ ] Rate limiting
- [ ] Input sanitization
- [ ] SQL injection prevention
- [ ] CORS setup
- [ ] API key rotation
- [ ] Encryption for sensitive data

---

## **Deployment Options**

### **Local Development**
```bash
docker-compose up
npm run dev:v2
```

### **Docker**
```bash
docker build -t rag-system .
docker run -e OPENAI_API_KEY=xxx rag-system
```

### **Cloud (AWS/GCP/Azure)**
```
ECS/Cloud Run + RDS PostgreSQL
Elastic Beanstalk
```

### **Kubernetes**
```
Helm charts
StatefulSet for DB
Deployment for app
```
