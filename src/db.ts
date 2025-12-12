/**
 * DATABASE MODULE
 * Quản lý kết nối PostgreSQL + pgvector
 */

import { Pool, QueryResult, PoolClient, QueryResultRow } from "pg";

const pool = new Pool({
  user: process.env.DB_USER || "rag_user",
  password: process.env.DB_PASSWORD || "rag_password",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5433"),
  database: process.env.DB_NAME || "rag_db",
});

pool.on("error", (err: Error) => {
  console.error("Unexpected error on idle client:", err);
});

/**
 * Query helper
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

/**
 * Get client (for transactions)
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

/**
 * Close pool
 */
export async function closePool(): Promise<void> {
  await pool.end();
}

/**
 * Test connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query("SELECT NOW()");
    console.log("✅ Database connected:", result.rows[0]);
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  }
}

// ============ DOCUMENTS ============

export interface Document {
  id: number;
  filename: string;
  content: string;
  source_type: string;
  created_at: Date;
  updated_at: Date;
}

export async function insertDocument(
  filename: string,
  content: string,
  sourceType: string = "policy"
): Promise<Document> {
  const result = await query<Document>(
    `INSERT INTO documents (filename, content, source_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (filename) DO UPDATE SET content = $2, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [filename, content, sourceType]
  );
  return result.rows[0];
}

export async function getDocument(filename: string): Promise<Document | null> {
  const result = await query<Document>(
    "SELECT * FROM documents WHERE filename = $1",
    [filename]
  );
  return result.rows[0] || null;
}

// ============ CHUNKS ============

export interface Chunk {
  id: number;
  doc_id: number;
  chunk_order: number;
  text: string;
  token_count: number;
  created_at: Date;
}

export async function insertChunks(
  docId: number,
  chunks: Array<{ text: string; tokenCount: number; order: number }>
): Promise<Chunk[]> {
  const values = chunks
    .map((c, i) => `(${docId}, ${c.order}, '${c.text.replace(/'/g, "''")}', ${c.tokenCount})`)
    .join(",");

  const result = await query<Chunk>(
    `INSERT INTO chunks (doc_id, chunk_order, text, token_count)
     VALUES ${values}
     RETURNING *`,
    []
  );
  return result.rows;
}

export async function getChunksByDocId(docId: number): Promise<Chunk[]> {
  const result = await query<Chunk>(
    "SELECT * FROM chunks WHERE doc_id = $1 ORDER BY chunk_order",
    [docId]
  );
  return result.rows;
}

// ============ EMBEDDINGS ============

export interface ChunkEmbedding {
  id: number;
  chunk_id: number;
  embedding: number[];
  model: string;
  created_at: Date;
}

export async function insertEmbedding(
  chunkId: number,
  embedding: number[],
  model: string = "text-embedding-3-small"
): Promise<ChunkEmbedding> {
  // Convert to pgvector format: [0.1,0.2,0.3...]
  const vectorString = `[${embedding.join(",")}]`;
  const result = await query<ChunkEmbedding>(
    `INSERT INTO chunk_embeddings (chunk_id, embedding, model)
     VALUES ($1, $2::vector, $3)
     RETURNING id, chunk_id, embedding, model, created_at`,
    [chunkId, vectorString, model]
  );
  return result.rows[0];
}

/**
 * Vector similarity search
 * Tìm top-K chunks tương tự với query embedding
 */
export async function similaritySearch(
  queryEmbedding: number[],
  topK: number = 5,
  similarityThreshold: number = 0.3
): Promise<any[]> {
  const embeddingString = JSON.stringify(queryEmbedding);
  const result = await query(
    `SELECT 
       c.id as chunk_id,
       c.text,
       d.filename,
       (1 - (ce.embedding <=> $1::vector)) as similarity
     FROM chunk_embeddings ce
     JOIN chunks c ON ce.chunk_id = c.id
     JOIN documents d ON c.doc_id = d.id
     WHERE (1 - (ce.embedding <=> $1::vector)) >= $2
     ORDER BY similarity DESC
     LIMIT $3`,
    [embeddingString, similarityThreshold, topK]
  );
  return result.rows;
}

// ============ RETRIEVAL LOGS ============

export async function logRetrieval(
  question: string,
  retrievedChunkIds: number[],
  llmModel: string,
  answer: string,
  tokensUsed: number,
  latencyMs: number,
  userId?: string
): Promise<void> {
  await query(
    `INSERT INTO retrieval_logs (question, retrieved_chunk_ids, llm_model, answer, tokens_used, latency_ms, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [question, JSON.stringify(retrievedChunkIds), llmModel, answer, tokensUsed, latencyMs, userId || "anonymous"]
  );
}
