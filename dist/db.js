"use strict";
/**
 * DATABASE MODULE
 * Quản lý kết nối PostgreSQL + pgvector
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = query;
exports.getClient = getClient;
exports.closePool = closePool;
exports.testConnection = testConnection;
exports.insertDocument = insertDocument;
exports.getDocument = getDocument;
exports.insertChunks = insertChunks;
exports.getChunksByDocId = getChunksByDocId;
exports.insertEmbedding = insertEmbedding;
exports.similaritySearch = similaritySearch;
exports.logRetrieval = logRetrieval;
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    user: process.env.DB_USER || "rag_user",
    password: process.env.DB_PASSWORD || "rag_password",
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5433"),
    database: process.env.DB_NAME || "rag_db",
});
pool.on("error", (err) => {
    console.error("Unexpected error on idle client:", err);
});
/**
 * Query helper
 */
async function query(text, params) {
    return pool.query(text, params);
}
/**
 * Get client (for transactions)
 */
async function getClient() {
    return pool.connect();
}
/**
 * Close pool
 */
async function closePool() {
    await pool.end();
}
/**
 * Test connection
 */
async function testConnection() {
    try {
        const result = await query("SELECT NOW()");
        console.log("✅ Database connected:", result.rows[0]);
        return true;
    }
    catch (error) {
        console.error("❌ Database connection failed:", error);
        return false;
    }
}
async function insertDocument(filename, content, sourceType = "policy") {
    const result = await query(`INSERT INTO documents (filename, content, source_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (filename) DO UPDATE SET content = $2, updated_at = CURRENT_TIMESTAMP
     RETURNING *`, [filename, content, sourceType]);
    return result.rows[0];
}
async function getDocument(filename) {
    const result = await query("SELECT * FROM documents WHERE filename = $1", [filename]);
    return result.rows[0] || null;
}
async function insertChunks(docId, chunks) {
    const values = chunks
        .map((c, i) => `(${docId}, ${c.order}, '${c.text.replace(/'/g, "''")}', ${c.tokenCount})`)
        .join(",");
    const result = await query(`INSERT INTO chunks (doc_id, chunk_order, text, token_count)
     VALUES ${values}
     RETURNING *`, []);
    return result.rows;
}
async function getChunksByDocId(docId) {
    const result = await query("SELECT * FROM chunks WHERE doc_id = $1 ORDER BY chunk_order", [docId]);
    return result.rows;
}
async function insertEmbedding(chunkId, embedding, model = "text-embedding-3-small") {
    // Convert to pgvector format: [0.1,0.2,0.3...]
    const vectorString = `[${embedding.join(",")}]`;
    const result = await query(`INSERT INTO chunk_embeddings (chunk_id, embedding, model)
     VALUES ($1, $2::vector, $3)
     RETURNING id, chunk_id, embedding, model, created_at`, [chunkId, vectorString, model]);
    return result.rows[0];
}
/**
 * Vector similarity search
 * Tìm top-K chunks tương tự với query embedding
 */
async function similaritySearch(queryEmbedding, topK = 5, similarityThreshold = 0.3) {
    const embeddingString = JSON.stringify(queryEmbedding);
    const result = await query(`SELECT 
       c.id as chunk_id,
       c.text,
       d.filename,
       (1 - (ce.embedding <=> $1::vector)) as similarity
     FROM chunk_embeddings ce
     JOIN chunks c ON ce.chunk_id = c.id
     JOIN documents d ON c.doc_id = d.id
     WHERE (1 - (ce.embedding <=> $1::vector)) >= $2
     ORDER BY similarity DESC
     LIMIT $3`, [embeddingString, similarityThreshold, topK]);
    return result.rows;
}
// ============ RETRIEVAL LOGS ============
async function logRetrieval(question, retrievedChunkIds, llmModel, answer, tokensUsed, latencyMs, userId) {
    await query(`INSERT INTO retrieval_logs (question, retrieved_chunk_ids, llm_model, answer, tokens_used, latency_ms, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`, [question, JSON.stringify(retrievedChunkIds), llmModel, answer, tokensUsed, latencyMs, userId || "anonymous"]);
}
