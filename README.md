<<<<<<< HEAD
# nocodb-nth
=======
# 🚀 RAG PROJECT - QUICK START GUIDE

## **Project Structure**

```
rag-poc/
├── src/
│   ├── db.ts                 # PostgreSQL connection + queries
│   ├── embedding.ts          # OpenAI embedding API
│   ├── retriever-db.ts       # Vector search from DB
│   ├── llm.ts                # GPT integration + system prompts
│   ├── server-v2.ts          # Express API (MAIN SERVER)
│   ├── server.ts             # Old in-memory version (deprecated)
│   ├── chunker.ts            # Document chunking
│   ├── fileLoader.ts         # File reading utilities
│   └── test.ts               # Integration test
├── data/
│   ├── policy_leave.md       # Sample HR policy
│   └── policy_lc.md          # Sample LC policy
├── docker-compose.yml        # PostgreSQL + pgvector
├── init.sql                  # Database schema
├── .env                      # Configuration (API keys, DB creds)
└── package.json             # Dependencies
```

---

## **Setup (First Time)**

### **1. Start Database**
```bash
cd /Users/macbookpro14/Project/AI-Trainning/RAG/rag-poc

# Start PostgreSQL + pgvector
docker-compose up -d

# Verify
docker-compose ps
```

### **2. Install Dependencies**
```bash
npm install
```

### **3. Configure .env**
```bash
# Add your OpenAI API key
OPENAI_API_KEY=sk-proj-xxx...
```

### **4. Build**
```bash
npm run build
```

### **5. Test**
```bash
npm test
# This runs with mock embeddings (no API cost)
```

---

## **Run Server**

### **Start Server v2** (with Vector DB)
```bash
npm run start:v2
```

Server will start on `http://localhost:3000`

### **Development Mode** (auto-reload)
```bash
npm run dev:v2
```

---

## **API Reference**

### **1. Health Check**
```bash
GET /health

Response:
{
  "status": "ok",
  "timestamp": "2025-12-11T...",
  "database": "connected"
}
```

### **2. Upload Document**
```bash
POST /upload
Content-Type: application/json

Body:
{
  "filename": "policy_leave.md",
  "sourceType": "policy"  // or "itsm"
}

Response:
{
  "status": "success",
  "filename": "policy_leave.md",
  "docId": 1,
  "chunksCreated": 5,
  "message": "..."
}
```

### **3. Ask Question** (Main Endpoint)
```bash
POST /ask
Content-Type: application/json

Body:
{
  "question": "Quy trình nghỉ phép là gì?",
  "topK": 5,              // optional, default 5
  "minSimilarity": 0.3    // optional, default 0.3
}

Response:
{
  "question": "Quy trình nghỉ phép là gì?",
  "answer": "Quy trình gồm các bước sau...",
  "sources": [
    { "source": "policy_leave.md", "relevance": 85 },
    { "source": "policy_leave.md", "relevance": 72 }
  ],
  "llmUsage": {
    "promptTokens": 450,
    "completionTokens": 320,
    "totalTokens": 770
  }
}
```

### **4. Get Statistics**
```bash
GET /stats

Response:
{
  "summary": {
    "totalDocuments": 2,
    "totalChunks": 12,
    "totalEmbeddings": 12,
    "totalQueries": 45
  },
  "files": [
    { "filename": "policy_leave.md", "chunk_count": 5 },
    { "filename": "policy_lc.md", "chunk_count": 7 }
  ]
}
```

### **5. Clear Database** ⚠️
```bash
POST /clear

# This deletes ALL data - use carefully!
```

---

## **How It Works (Pipeline)**

```
1. User uploads document
   └─> File loaded from ./data
   
2. Document processing
   └─> Split into chunks (~500 tokens each)
   └─> Insert chunks into PostgreSQL
   
3. Embedding
   └─> Call OpenAI Embedding API
   └─> Store vectors in PostgreSQL (pgvector)
   
4. User asks question
   └─> Embed question (same API)
   └─> Query PostgreSQL for similar vectors
   └─> Return top-5 matching chunks
   
5. LLM Response
   └─> Build context from chunks
   └─> Create system prompt (policy/itsm)
   └─> Call GPT-4-turbo
   └─> Return answer + sources
   
6. Logging
   └─> Log question, answer, sources, tokens, latency
```

---

## **Common Tasks**

### **Add More Documents**
```bash
# 1. Add file to ./data folder
cp my_policy.md data/

# 2. Upload via API
curl -X POST http://localhost:3000/upload \
  -H "Content-Type: application/json" \
  -d '{"filename":"my_policy.md","sourceType":"policy"}'
```

### **Query with Custom Settings**
```bash
# Get top-10 results with high threshold
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is the leave policy?",
    "topK": 10,
    "minSimilarity": 0.5
  }'
```

### **Check Database**
```bash
# SSH into database
docker exec -it rag-postgres psql -U rag_user -d rag_db

# See documents
SELECT * FROM documents;

# See chunks
SELECT id, doc_id, text FROM chunks LIMIT 5;

# See embeddings
SELECT COUNT(*) FROM chunk_embeddings;

# See query logs
SELECT * FROM retrieval_logs ORDER BY created_at DESC;
```

### **Reset Everything**
```bash
# Stop and remove database
docker-compose down -v

# Restart fresh
docker-compose up -d

# Run test
npm test
```

---

## **Troubleshooting**

### **Problem: "OPENAI_API_KEY not set"**
```
Solution: Add API key to .env
OPENAI_API_KEY=sk-proj-xxx...
```

### **Problem: "Database connection failed"**
```
Solution: Check if PostgreSQL is running
docker-compose ps

If not running:
docker-compose up -d
```

### **Problem: "Port 5433 already in use"**
```
Solution: Change port in docker-compose.yml
ports:
  - "5434:5432"  # Use 5434 instead
  
Update .env:
DB_PORT=5434
```

### **Problem: Vector search returns no results**
```
Possible causes:
1. Similarity threshold too high (increase topK)
2. Document not uploaded yet
3. Query completely different from docs

Solution:
curl -X POST http://localhost:3000/ask \
  -d '{"question":"...", "topK":10, "minSimilarity":0.1}'
```

---

## **Environment Variables**

```
# OpenAI
OPENAI_API_KEY=sk-proj-xxx...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_LLM_MODEL=gpt-4-turbo

# Server
PORT=3000
NODE_ENV=development

# Database
DB_USER=rag_user
DB_PASSWORD=rag_password
DB_HOST=localhost
DB_PORT=5433
DB_NAME=rag_db
```

---

## **Next Steps**

### ⭐ **Recommended Priority:**

1. **Now:** Use the RAG system as-is
   - Upload your company policies
   - Test queries
   - Gather feedback

2. **This Week:** Add security
   - JWT authentication
   - Rate limiting
   - Input validation

3. **Next Week:** Improve quality
   - Hybrid search (keyword + semantic)
   - Reranking for better answers
   - Chat history for multi-turn

4. **Following Week:** Production readiness
   - Docker image
   - CI/CD pipeline
   - Monitoring setup

---

## **Key Files to Understand**

| File | Purpose | Key Functions |
|------|---------|---|
| `server-v2.ts` | Main API server | All endpoints |
| `db.ts` | Database layer | Query, insert, search |
| `embedding.ts` | OpenAI integration | embedTexts(), processAndEmbedDocument() |
| `retriever-db.ts` | Vector search | retrieveRelevantChunks() |
| `llm.ts` | LLM + prompts | generateAnswer(), system prompts |
| `test.ts` | Integration test | Full pipeline demo |

---

## **Support**

Need help?
- Check `/REVIEW.md` for detailed analysis
- Review error messages in server logs
- Check Docker logs: `docker-compose logs postgres`
- Test with mock embeddings: `npm test`
>>>>>>> 385d047 (First commit)
