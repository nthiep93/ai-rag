"use strict";
/**
 * RAG SERVER v2 - PostgreSQL + pgvector powered
 *
 * Endpoints:
 *   GET  /health           - Health check
 *   POST /upload           - Upload + embed document
 *   POST /ask              - Query RAG
 *   GET  /stats            - Database statistics
 *   POST /clear            - Clear all data
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
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db = __importStar(require("./db"));
const embeddingModule = __importStar(require("./embedding"));
const retrieverDb = __importStar(require("./retriever-db"));
const llm_1 = require("./llm");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use(express_1.default.json());
/**
 * GET /health - Health check
 */
app.get("/health", async (req, res) => {
    try {
        const dbHealthy = await db.testConnection();
        res.json({
            status: "ok",
            timestamp: new Date().toISOString(),
            database: dbHealthy ? "connected" : "disconnected",
        });
    }
    catch (error) {
        res.status(500).json({
            status: "error",
            message: "Database connection failed",
        });
    }
});
/**
 * POST /upload - Upload and embed a document
 *
 * Request body:
 * {
 *   filename: string
 *   sourceType: "policy" | "itsm" | "other"
 * }
 *
 * The file should be in ./data folder
 */
app.post("/upload", async (req, res) => {
    try {
        const { filename, sourceType = "policy" } = req.body;
        if (!filename) {
            return res.status(400).json({ error: "Filename is required" });
        }
        const filePath = path_1.default.join(__dirname, "../data", filename);
        if (!fs_1.default.existsSync(filePath)) {
            return res.status(404).json({
                error: `File not found: ${filename}`,
                hint: "Make sure the file is in ./data folder",
            });
        }
        console.log(`\n📄 Uploading file: ${filename}`);
        // Read file content
        const content = fs_1.default.readFileSync(filePath, "utf-8");
        // Process and embed
        const result = await embeddingModule.processAndEmbedDocument(filename, content, sourceType);
        res.json({
            status: "success",
            filename,
            docId: result.docId,
            chunksCreated: result.chunkCount,
            message: `Document uploaded and embedded. ${result.chunkCount} chunks created.`,
        });
    }
    catch (error) {
        console.error("Upload error:", error.message);
        res.status(500).json({
            error: "Failed to upload document",
            message: error.message,
        });
    }
});
/**
 * POST /ask - Main RAG endpoint
 *
 * Request body:
 * {
 *   question: string
 *   topK?: number (default 5)
 *   minSimilarity?: number (default 0.3)
 * }
 *
 * Response:
 * {
 *   question: string
 *   answer: string
 *   sources: [{ filename, relevance }]
 *   llmUsage: { promptTokens, completionTokens, totalTokens }
 * }
 */
app.post("/ask", async (req, res) => {
    const startTime = Date.now();
    try {
        const { question, topK = 5, minSimilarity = 0.3 } = req.body;
        if (!question || question.trim().length === 0) {
            return res.status(400).json({ error: "Question is required" });
        }
        console.log(`\n❓ Question: "${question}"`);
        // Step 1: Retrieve relevant chunks
        const retrievedChunks = await retrieverDb.retrieveRelevantChunks(question, topK, minSimilarity);
        if (retrievedChunks.length === 0) {
            console.log("⚠️  No relevant chunks found");
            return res.json({
                question,
                answer: "Tôi không tìm thấy thông tin liên quan. Vui lòng liên hệ bộ phận HR hoặc IT Support.",
                sources: [],
                llmUsage: null,
            });
        }
        // Step 2: Build context from chunks
        const context = retrieverDb.buildContext(retrievedChunks, true);
        // Step 3: Generate answer with LLM
        console.log("🤖 Generating answer...");
        const llmResponse = await (0, llm_1.generateAnswer)(context, question);
        // Step 4: Log retrieval
        const latencyMs = Date.now() - startTime;
        const chunkIds = retrievedChunks.map((c) => c.chunkId);
        await db.logRetrieval(question, chunkIds, process.env.OPENAI_LLM_MODEL || "gpt-4-turbo", llmResponse.answer, llmResponse.usage.totalTokens, latencyMs, "web-user");
        // Step 5: Format response
        const response = {
            question,
            answer: llmResponse.answer,
            sources: retrievedChunks.map((c) => ({
                source: c.filename,
                relevance: Math.round(c.similarity * 100),
            })),
            llmUsage: llmResponse.usage,
        };
        console.log(`✅ Answer generated in ${latencyMs}ms\n`);
        res.json(response);
    }
    catch (error) {
        console.error("Ask error:", error.message);
        res.status(500).json({
            error: "Failed to process question",
            message: error.message,
        });
    }
});
/**
 * GET /stats - Database statistics
 */
app.get("/stats", async (req, res) => {
    try {
        const docsResult = await db.query("SELECT COUNT(*) as count FROM documents");
        const chunksResult = await db.query("SELECT COUNT(*) as count FROM chunks");
        const embeddingsResult = await db.query("SELECT COUNT(*) as count FROM chunk_embeddings");
        const logsResult = await db.query("SELECT COUNT(*) as count FROM retrieval_logs");
        const filesResult = await db.query("SELECT filename, COUNT(*) as chunk_count FROM documents d JOIN chunks c ON d.id = c.doc_id GROUP BY d.id, d.filename");
        res.json({
            summary: {
                totalDocuments: parseInt(docsResult.rows[0]?.count || 0),
                totalChunks: parseInt(chunksResult.rows[0]?.count || 0),
                totalEmbeddings: parseInt(embeddingsResult.rows[0]?.count || 0),
                totalQueries: parseInt(logsResult.rows[0]?.count || 0),
            },
            files: filesResult.rows,
        });
    }
    catch (error) {
        res.status(500).json({
            error: "Failed to fetch statistics",
            message: error.message,
        });
    }
});
/**
 * POST /clear - Clear all data from database
 * ⚠️  USE WITH CAUTION
 */
app.post("/clear", async (req, res) => {
    try {
        console.log("⚠️  Clearing all data...");
        // Clear tables (respecting foreign keys)
        await db.query("DELETE FROM retrieval_logs");
        await db.query("DELETE FROM chunk_embeddings");
        await db.query("DELETE FROM chunks");
        await db.query("DELETE FROM documents");
        res.json({
            status: "success",
            message: "All data cleared",
        });
    }
    catch (error) {
        res.status(500).json({
            error: "Failed to clear data",
            message: error.message,
        });
    }
});
/**
 * Start server
 */
async function startServer() {
    try {
        // Test database connection
        console.log("\n🚀 RAG Server v2 (PostgreSQL + pgvector)\n");
        const dbConnected = await db.testConnection();
        if (!dbConnected) {
            throw new Error("Could not connect to database");
        }
        // Start Express server
        app.listen(PORT, () => {
            console.log(`\n🌐 Server running on http://localhost:${PORT}\n`);
            console.log("Endpoints:");
            console.log(`  GET  /health        - Health check`);
            console.log(`  POST /upload        - Upload document (body: {filename, sourceType})`);
            console.log(`  POST /ask           - Ask question (body: {question, topK?, minSimilarity?})`);
            console.log(`  GET  /stats         - Database statistics`);
            console.log(`  POST /clear         - Clear all data\n`);
        });
    }
    catch (error) {
        console.error("Server startup error:", error);
        process.exit(1);
    }
}
// Start server
startServer();
