"use strict";
/**
 * RAG SERVER - Express.js
 * Endpoints:
 *   GET /health - Health check
 *   POST /ask - Query RAG (JSON body: { question })
 *   GET /stats - Vector store statistics
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Load environment variables FIRST
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const express_1 = __importDefault(require("express"));
const path = __importStar(require("path"));
const fileLoader_1 = require("./fileLoader");
const chunker_1 = require("./chunker");
const embedding_1 = require("./embedding");
const retriever_1 = require("./retriever");
const llm_1 = require("./llm");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use(express_1.default.json());
// Global state
let vectorStore = null;
let retriever = null;
/**
 * Initialize RAG Pipeline
 * 1. Load files
 * 2. Chunk documents
 * 3. Embed chunks
 * 4. Build vector store
 */
async function initializeRAG() {
    console.log("\n🚀 Initializing RAG Pipeline...\n");
    try {
        // Step 1: Load files
        console.log("📂 Step 1: Loading documents...");
        const dataDir = path.join(__dirname, "../data");
        const docs = (0, fileLoader_1.loadFilesFromDirectory)(dataDir);
        if (docs.size === 0) {
            throw new Error("No documents found in ./data directory");
        }
        // Step 2: Chunk documents
        console.log("\n✂️  Step 2: Chunking documents...");
        const chunks = (0, chunker_1.chunkMultipleDocs)(docs, 500); // Max 500 tokens per chunk
        console.log(`   Total chunks created: ${chunks.length}`);
        // Step 3: Embed all chunks
        console.log("\n🔢 Step 3: Embedding chunks (calling OpenAI)...");
        const chunkTexts = chunks.map((c) => c.text);
        const embeddingResults = await (0, embedding_1.embedTexts)(chunkTexts);
        console.log(`   Embedding completed`);
        // Step 4: Build vector store
        console.log("\n💾 Step 4: Building vector store...");
        vectorStore = new retriever_1.VectorStore();
        for (let i = 0; i < chunks.length; i++) {
            vectorStore.addChunk({
                ...chunks[i],
                vector: embeddingResults[i].vector,
            });
        }
        retriever = new retriever_1.Retriever(vectorStore);
        const stats = vectorStore.getStats();
        console.log(`   Vector store ready: ${stats.totalChunks} chunks from ${stats.sources.size} sources`);
        console.log("\n✨ RAG Pipeline initialized successfully!\n");
    }
    catch (error) {
        console.error("❌ Initialization failed:", error);
        process.exit(1);
    }
}
/**
 * Endpoint: Health Check
 */
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        ragReady: vectorStore !== null,
    });
});
/**
 * Endpoint: /ask - Main RAG endpoint
 * Request body: { question: string }
 * Response: { question, answer, sources, llmUsage }
 */
app.post("/ask", async (req, res) => {
    try {
        const { question } = req.body;
        if (!question || question.trim().length === 0) {
            return res.status(400).json({ error: "Question is required" });
        }
        if (!retriever || !vectorStore) {
            return res.status(503).json({ error: "RAG pipeline not initialized" });
        }
        console.log(`\n📌 Question: "${question}"`);
        // Step 1: Retrieve relevant chunks
        const retrievalResults = await retriever.retrieve(question, 5, 0.3);
        if (retrievalResults.length === 0) {
            return res.json({
                question,
                answer: "I don't have enough information to answer this question. Please contact HR or the relevant department.",
                sources: [],
                llmUsage: null,
            });
        }
        // Step 2: Build context from retrieved chunks
        const context = (0, retriever_1.buildContext)(retrievalResults, true);
        // Step 3: Call LLM to generate answer
        console.log("🤖 Generating answer with LLM...");
        const llmResponse = await (0, llm_1.generateAnswer)(context, question);
        // Step 4: Extract sources
        const sources = retrievalResults.map((r) => ({
            source: r.chunk.source,
            relevance: Math.round(r.similarity * 100),
        }));
        // Prepare response
        const response = {
            question,
            answer: llmResponse.answer,
            sources,
            llmUsage: llmResponse.usage,
        };
        res.json(response);
    }
    catch (error) {
        console.error("Error in /ask:", error.message);
        res.status(500).json({
            error: "Failed to process question",
            message: error.message,
        });
    }
});
/**
 * Endpoint: /stats - Vector store statistics
 */
app.get("/stats", (req, res) => {
    if (!vectorStore) {
        return res.status(503).json({ error: "RAG pipeline not initialized" });
    }
    const stats = vectorStore.getStats();
    res.json({
        totalChunks: stats.totalChunks,
        sources: Array.from(stats.sources),
    });
});
/**
 * Start server
 */
async function startServer() {
    try {
        // Initialize RAG
        await initializeRAG();
        // Start Express server
        app.listen(PORT, () => {
            console.log(`\n🌐 Server running on http://localhost:${PORT}`);
            console.log(`\nEndpoints:`);
            console.log(`  GET  /health  - Health check`);
            console.log(`  POST /ask      - Ask a question (JSON: { question })`);
            console.log(`  GET  /stats    - Vector store stats\n`);
        });
    }
    catch (error) {
        console.error("Server startup error:", error);
        process.exit(1);
    }
}
// Start server
startServer();
