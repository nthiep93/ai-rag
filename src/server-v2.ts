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

// Load environment variables FIRST
import * as dotenv from "dotenv";
dotenv.config();

import express, { Express, Request, Response } from "express";
import fs from "fs";
import path from "path";
import * as db from "./db";
import * as embeddingModule from "./embedding";
import * as retrieverDb from "./retriever-db";
import { generateAnswer, RAGResponse, getSystemPromptByType } from "./llm";

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

/**
 * GET /health - Health check
 */
app.get("/health", async (req: Request, res: Response) => {
  try {
    const dbHealthy = await db.testConnection();
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: dbHealthy ? "connected" : "disconnected",
    });
  } catch (error) {
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
app.post("/upload", async (req: Request, res: Response) => {
  try {
    const { filename, sourceType = "policy" } = req.body;

    if (!filename) {
      return res.status(400).json({ error: "Filename is required" });
    }

    const filePath = path.join(__dirname, "../data", filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: `File not found: ${filename}`,
        hint: "Make sure the file is in ./data folder",
      });
    }

    console.log(`\n📄 Uploading file: ${filename}`);

    // Read file content
    const content = fs.readFileSync(filePath, "utf-8");

    // Process and embed
    const result = await embeddingModule.processAndEmbedDocument(
      filename,
      content,
      sourceType
    );

    res.json({
      status: "success",
      filename,
      docId: result.docId,
      chunksCreated: result.chunkCount,
      message: `Document uploaded and embedded. ${result.chunkCount} chunks created.`,
    });
  } catch (error: any) {
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
app.post("/ask", async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { question, topK = 5, minSimilarity = 0.3 } = req.body;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({ error: "Question is required" });
    }

    console.log(`\n❓ Question: "${question}"`);

    // Step 1: Retrieve relevant chunks
    const retrievedChunks = await retrieverDb.retrieveRelevantChunks(
      question,
      topK,
      minSimilarity
    );

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
    const llmResponse = await generateAnswer(context, question);

    // Step 4: Log retrieval
    const latencyMs = Date.now() - startTime;
    const chunkIds = retrievedChunks.map((c) => c.chunkId);
    await db.logRetrieval(
      question,
      chunkIds,
      process.env.OPENAI_LLM_MODEL || "gpt-4-turbo",
      llmResponse.answer,
      llmResponse.usage.totalTokens,
      latencyMs,
      "web-user"
    );

    // Step 5: Format response
    const response: RAGResponse = {
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
  } catch (error: any) {
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
app.get("/stats", async (req: Request, res: Response) => {
  try {
    const docsResult = await db.query("SELECT COUNT(*) as count FROM documents");
    const chunksResult = await db.query("SELECT COUNT(*) as count FROM chunks");
    const embeddingsResult = await db.query(
      "SELECT COUNT(*) as count FROM chunk_embeddings"
    );
    const logsResult = await db.query("SELECT COUNT(*) as count FROM retrieval_logs");

    const filesResult = await db.query(
      "SELECT filename, COUNT(*) as chunk_count FROM documents d JOIN chunks c ON d.id = c.doc_id GROUP BY d.id, d.filename"
    );

    res.json({
      summary: {
        totalDocuments: parseInt(docsResult.rows[0]?.count || 0),
        totalChunks: parseInt(chunksResult.rows[0]?.count || 0),
        totalEmbeddings: parseInt(embeddingsResult.rows[0]?.count || 0),
        totalQueries: parseInt(logsResult.rows[0]?.count || 0),
      },
      files: filesResult.rows,
    });
  } catch (error: any) {
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
app.post("/clear", async (req: Request, res: Response) => {
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
  } catch (error: any) {
    res.status(500).json({
      error: "Failed to clear data",
      message: error.message,
    });
  }
});

/**
 * Start server
 */
async function startServer(): Promise<void> {
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
  } catch (error) {
    console.error("Server startup error:", error);
    process.exit(1);
  }
}

// Start server
startServer();
