/**
 * TEST SCRIPT - Mock embedding mode
 * Demonstrates full RAG pipeline without OpenAI cost
 */

import * as dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import * as db from "./db";

// Mock embedding function (deterministic, no API calls)
function mockEmbedding(text: string): number[] {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  const vector: number[] = [];
  for (let i = 0; i < 1536; i++) {
    vector.push(seededRandom(hash + i) - 0.5);
  }

  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);

  return vector.map((v) => v / norm);
}

// Estimate tokens
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Chunk text
function chunkText(text: string, maxTokens: number = 500): string[] {
  const chunks: string[] = [];
  const paragraphs = text
    .split(/\n\n+/)
    .filter((p) => p.trim().length > 0);

  let currentChunk = "";

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    if (paraTokens > maxTokens) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }

      const sentences = para.split(/(?<=[.!?])\s+/);
      let sentenceChunk = "";

      for (const sentence of sentences) {
        const sentTokens = estimateTokens(sentenceChunk + " " + sentence);
        if (sentTokens > maxTokens && sentenceChunk) {
          chunks.push(sentenceChunk.trim());
          sentenceChunk = sentence;
        } else {
          sentenceChunk += (sentenceChunk ? " " : "") + sentence;
        }
      }

      if (sentenceChunk.trim()) {
        chunks.push(sentenceChunk.trim());
      }
    } else {
      const totalTokens = estimateTokens(currentChunk + "\n\n" + para);
      if (totalTokens > maxTokens && currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = para;
      } else {
        currentChunk += (currentChunk ? "\n\n" : "") + para;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Main test function
 */
async function runTest() {
  try {
    console.log("\n🧪 RAG PIPELINE TEST (Mock Embedding Mode)\n");
    console.log("=====================================\n");

    // Step 1: Clear DB
    console.log("🧹 Clearing database...");
    await db.query("DELETE FROM retrieval_logs");
    await db.query("DELETE FROM chunk_embeddings");
    await db.query("DELETE FROM chunks");
    await db.query("DELETE FROM documents");
    console.log("  ✅ Database cleared\n");

    // Step 2: Load and process document
    console.log("📄 Loading document: policy_leave.md");
    const filePath = path.join(
      __dirname,
      "../data/policy_leave.md"
    );
    const content = fs.readFileSync(filePath, "utf-8");
    console.log(`  ✅ Loaded (${content.length} chars)\n`);

    // Step 3: Insert document
    console.log("💾 Inserting into documents table...");
    const doc = await db.insertDocument("policy_leave.md", content, "policy");
    console.log(`  ✅ Document ID: ${doc.id}\n`);

    // Step 4: Chunk document
    console.log("✂️  Chunking document...");
    const chunks = chunkText(content, 500);
    console.log(`  ✅ Created ${chunks.length} chunks\n`);

    // Step 5: Insert chunks
    console.log("💾 Inserting chunks into database...");
    const insertedChunks = await db.insertChunks(
      doc.id,
      chunks.map((c, i) => ({
        text: c,
        tokenCount: estimateTokens(c),
        order: i,
      }))
    );
    console.log(`  ✅ ${insertedChunks.length} chunks inserted\n`);

    // Step 6: Mock embed and save
    console.log("🔢 Embedding chunks (mock mode - no API calls)...");
    for (let i = 0; i < insertedChunks.length; i++) {
      const embedding = mockEmbedding(chunks[i]);
      await db.insertEmbedding(insertedChunks[i].id, embedding, "mock-embedding");
    }
    console.log(`  ✅ All chunks embedded\n`);

    // Step 7: Test vector search
    console.log("🔍 Testing vector similarity search...");
    const testQuestions = [
      "Quy trình nghỉ phép ở công ty là gì?",
      "Tôi được nghỉ phép bao nhiêu ngày?",
      "Làm sao để xin nghỉ phép?",
    ];

    for (const question of testQuestions) {
      console.log(`\n  ❓ Question: "${question}"`);
      const queryEmbedding = mockEmbedding(question);
      const results = await db.similaritySearch(queryEmbedding, 2, 0.0);

      if (results.length > 0) {
        console.log(`  ✅ Found ${results.length} relevant chunks:`);
        results.forEach((r: any, idx: number) => {
          const similarity = Math.round(r.similarity * 100);
          const preview = r.text.substring(0, 60).replace(/\n/g, " ");
          console.log(`     [${idx + 1}] (${similarity}%) ${preview}...`);
        });
      } else {
        console.log("  ⚠️  No results found");
      }
    }

    // Step 8: Check stats
    console.log("\n\n📊 Database Statistics:");
    const docsResult = await db.query("SELECT COUNT(*) as count FROM documents");
    const chunksResult = await db.query("SELECT COUNT(*) as count FROM chunks");
    const embeddingsResult = await db.query(
      "SELECT COUNT(*) as count FROM chunk_embeddings"
    );

    console.log(`  📄 Documents: ${docsResult.rows[0]?.count}`);
    console.log(`  ✂️  Chunks: ${chunksResult.rows[0]?.count}`);
    console.log(`  🔢 Embeddings: ${embeddingsResult.rows[0]?.count}\n`);

    console.log("✅ TEST COMPLETE!\n");
    console.log("=====================================");
    console.log("\n💡 Next steps:");
    console.log("  1. Add your real OpenAI API key to .env");
    console.log("  2. POST /upload to upload documents");
    console.log("  3. POST /ask to query the RAG system");
    console.log("  4. GET /stats to see database statistics\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

// Run test
runTest();
