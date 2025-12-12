"use strict";
/**
 * RETRIEVER MODULE
 * Chức năng: Tìm Top-K chunks tương tự với query
 * Strategy: In-memory vector store (array + cosine similarity)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Retriever = exports.VectorStore = void 0;
exports.buildContext = buildContext;
const embedding_1 = require("./embedding");
/**
 * In-memory Vector Store
 * Lưu trữ: ID, text, vector, metadata (source, order)
 */
class VectorStore {
    constructor() {
        this.chunks = [];
    }
    /**
     * Thêm chunk vào vector store
     */
    addChunk(chunk) {
        this.chunks.push(chunk);
    }
    /**
     * Thêm nhiều chunks
     */
    addChunks(chunks) {
        this.chunks.push(...chunks);
    }
    /**
     * Tìm Top-K chunks tương tự với query vector
     */
    search(queryVector, topK = 5) {
        const results = this.chunks.map((chunk) => ({
            chunk,
            similarity: (0, embedding_1.cosineSimilarity)(queryVector, chunk.vector),
        }));
        // Sort by similarity (descending)
        results.sort((a, b) => b.similarity - a.similarity);
        // Return top K
        return results.slice(0, topK);
    }
    /**
     * Get store statistics
     */
    getStats() {
        const sources = new Set(this.chunks.map((c) => c.source));
        return {
            totalChunks: this.chunks.length,
            sources,
        };
    }
    /**
     * Clear store (for reset)
     */
    clear() {
        this.chunks = [];
    }
}
exports.VectorStore = VectorStore;
/**
 * Retriever class - bao gói việc query + rank
 */
class Retriever {
    constructor(vectorStore) {
        this.vectorStore = vectorStore;
    }
    /**
     * Query: embed câu hỏi → tìm top-k chunks
     */
    async retrieve(question, topK = 5, minSimilarity = 0.3) {
        try {
            // Bước 1: Embed câu hỏi
            console.log("🔍 Embedding query...");
            const queryVector = await (0, embedding_1.embedText)(question);
            // Bước 2: Tìm top-k
            console.log(`📊 Searching for top-${topK} similar chunks...`);
            let results = this.vectorStore.search(queryVector, topK);
            // Bước 3: Filter by minimum similarity threshold
            results = results.filter((r) => r.similarity >= minSimilarity);
            console.log(`✅ Found ${results.length} relevant chunks`);
            return results;
        }
        catch (error) {
            console.error("Retrieval error:", error);
            throw error;
        }
    }
}
exports.Retriever = Retriever;
/**
 * Context Builder: ghép chunks thành 1 context string
 */
function buildContext(results, includeMetadata = true) {
    if (results.length === 0) {
        return "No relevant information found in the knowledge base.";
    }
    let context = "";
    for (const result of results) {
        const { chunk, similarity } = result;
        const metadata = includeMetadata
            ? `[Source: ${chunk.source}, Relevance: ${(similarity * 100).toFixed(1)}%]`
            : "";
        context += `${metadata}\n${chunk.text}\n\n`;
    }
    return context.trim();
}
