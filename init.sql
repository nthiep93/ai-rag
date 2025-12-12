-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Table: documents (store original docs)
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  content TEXT NOT NULL,
  source_type VARCHAR(50) DEFAULT 'policy',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: chunks (store chunked documents)
CREATE TABLE IF NOT EXISTS chunks (
  id SERIAL PRIMARY KEY,
  doc_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_order INT NOT NULL,
  text TEXT NOT NULL,
  token_count INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(doc_id, chunk_order)
);

-- Table: chunk_embeddings (store vectors)
CREATE TABLE IF NOT EXISTS chunk_embeddings (
  id SERIAL PRIMARY KEY,
  chunk_id INT NOT NULL UNIQUE REFERENCES chunks(id) ON DELETE CASCADE,
  embedding vector(1536), -- OpenAI embedding size
  model VARCHAR(50) DEFAULT 'text-embedding-3-small',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster search
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_embedding 
  ON chunk_embeddings USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks(doc_id);
CREATE INDEX IF NOT EXISTS idx_documents_source_type ON documents(source_type);

-- Table: retrieval_logs (audit trail)
CREATE TABLE IF NOT EXISTS retrieval_logs (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  retrieved_chunk_ids TEXT, -- JSON array of chunk IDs
  llm_model VARCHAR(50),
  answer TEXT,
  tokens_used INT,
  latency_ms INT,
  user_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_retrieval_logs_created_at ON retrieval_logs(created_at);
