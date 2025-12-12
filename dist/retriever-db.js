"use strict";
/**
 * RETRIEVER MODULE v2 - DATABASE BASED
 * Chức năng: Query vector DB (PostgreSQL + pgvector) để tìm relevant chunks
 *
 * Flow:
 * 1. User hỏi question
 * 2. Embed question (OpenAI API)
 * 3. Query vector DB (similarity search)
 * 4. Return top-K chunks + relevance scores
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.retrieveRelevantChunks = retrieveRelevantChunks;
exports.buildContext = buildContext;
const db = __importStar(require("./db"));
const embedding_1 = require("./embedding");
/**
 * Retrieve relevant chunks from database based on query
 *
 * @param question - User's question
 * @param topK - Number of top results to return (default 5)
 * @param minSimilarity - Minimum similarity threshold (default 0.3)
 * @returns Array of relevant chunks with similarity scores
 */
async function retrieveRelevantChunks(question, topK = 5, minSimilarity = 0.3) {
    try {
        console.log(`\n🔍 Retrieving relevant chunks for: "${question}"`);
        // Step 1: Embed the question
        console.log("  📝 Embedding question...");
        const queryEmbedding = await (0, embedding_1.embedText)(question);
        // Step 2: Search vector store in database
        console.log(`  📊 Searching vector DB (top-${topK}, similarity >= ${minSimilarity})...`);
        const searchResults = await db.similaritySearch(queryEmbedding, topK, minSimilarity);
        // Step 3: Format results
        const results = searchResults.map((row) => ({
            chunkId: row.chunk_id,
            text: row.text,
            filename: row.filename,
            similarity: row.similarity,
        }));
        console.log(`  ✅ Found ${results.length} relevant chunks\n`);
        return results;
    }
    catch (error) {
        console.error("Retrieval error:", error);
        throw error;
    }
}
/**
 * Build context string từ retrieved chunks
 * Ghép tất cả chunks thành 1 formatted context để gửi cho LLM
 */
function buildContext(results, includeMetadata = true) {
    if (results.length === 0) {
        return "No relevant information found in the knowledge base.";
    }
    let context = "";
    for (let i = 0; i < results.length; i++) {
        const { text, filename, similarity } = results[i];
        const relevancePercent = Math.round(similarity * 100);
        if (includeMetadata) {
            context += `[Source: ${filename} | Relevance: ${relevancePercent}%]\n`;
        }
        context += `${text}\n\n`;
    }
    return context.trim();
}
