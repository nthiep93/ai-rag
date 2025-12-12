/**
 * RAG SERVER - Express.js
 * Endpoints:
 *   GET /health - Health check
 *   POST /ask - Query RAG (JSON body: { question })
 *   GET /stats - Vector store statistics
 */

// Load environment variables FIRST
import * as dotenv from "dotenv";
dotenv.config();

import express, { Express, Request, Response } from "express";
import * as path from "path";
import { loadFilesFromDirectory } from "./fileLoader";
import { chunkMultipleDocs } from "./chunker";
import { embedTexts } from "./embedding";
import { VectorStore, Retriever, buildContext } from "./retriever";
import { generateAnswer, RAGResponse } from "./llm";

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Global state
let vectorStore: VectorStore | null = null;
let retriever: Retriever | null = null;

/**
 * Initialize RAG Pipeline
 * 1. Load files
 * 2. Chunk documents
 * 3. Embed chunks
 * 4. Build vector store
 */
async function initializeRAG(): Promise<void> {
  console.log("\n🚀 Initializing RAG Pipeline...\n");

  try {
    // Step 1: Load files
    console.log("📂 Step 1: Loading documents...");
    const dataDir = path.join(__dirname, "../data");
    const docs = loadFilesFromDirectory(dataDir);

    if (docs.size === 0) {
      throw new Error("No documents found in ./data directory");
    }

    // Step 2: Chunk documents
    console.log("\n✂️  Step 2: Chunking documents...");
    const chunks = chunkMultipleDocs(docs, 500); // Max 500 tokens per chunk
    console.log(`   Total chunks created: ${chunks.length}`);

    // Step 3: Embed all chunks
    console.log("\n🔢 Step 3: Embedding chunks (calling OpenAI)...");
    const chunkTexts = chunks.map((c) => c.text);
    const embeddingResults = await embedTexts(chunkTexts);
    console.log(`   Embedding completed`);

    // Step 4: Build vector store
    console.log("\n💾 Step 4: Building vector store...");
    vectorStore = new VectorStore();

    for (let i = 0; i < chunks.length; i++) {
      vectorStore.addChunk({
        ...chunks[i],
        vector: embeddingResults[i].vector,
      });
    }

    retriever = new Retriever(vectorStore);
    const stats = vectorStore.getStats();
    console.log(`   Vector store ready: ${stats.totalChunks} chunks from ${stats.sources.size} sources`);

    console.log("\n✨ RAG Pipeline initialized successfully!\n");
  } catch (error) {
    console.error("❌ Initialization failed:", error);
    process.exit(1);
  }
}

/**
 * Endpoint: Health Check
 */
app.get("/health", (req: Request, res: Response) => {
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
app.post("/ask", async (req: Request, res: Response) => {
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
    const context = buildContext(retrievalResults, true);

    // Step 3: Call LLM to generate answer
    console.log("🤖 Generating answer with LLM...");
    const llmResponse = await generateAnswer(context, question);

    // Step 4: Extract sources
    const sources = retrievalResults.map((r) => ({
      source: r.chunk.source,
      relevance: Math.round(r.similarity * 100),
    }));

    // Prepare response
    const response: RAGResponse = {
      question,
      answer: llmResponse.answer,
      sources,
      llmUsage: llmResponse.usage,
    };

    res.json(response);
  } catch (error: any) {
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
app.get("/stats", (req: Request, res: Response) => {
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
async function startServer(): Promise<void> {
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
  } catch (error) {
    console.error("Server startup error:", error);
    process.exit(1);
  }
}

// Start server
startServer();
