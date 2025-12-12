/**
 * EMBEDDING MODULE v2
 * Chức năng: Gọi OpenAI embedding API + save vào PostgreSQL
 * 
 * Flow:
 * 1. Load file từ ./data
 * 2. Insert document vào documents table
 * 3. Chunk document
 * 4. Insert chunks vào chunks table
 * 5. Embed chunks (OpenAI API)
 * 6. Save embeddings vào chunk_embeddings table
 */

import axios from "axios";
import * as db from "./db";

interface EmbeddingResult {
  text: string;
  vector: number[];
  model: string;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const OPENAI_API_URL = "https://api.openai.com/v1/embeddings";

console.log(`📝 Using embedding model: ${EMBEDDING_MODEL}`);

/**
 * Call OpenAI Embedding API - embed multiple texts
 */
export async function embedTexts(texts: string[]): Promise<EmbeddingResult[]> {
  if (!OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set. Please add your OpenAI API key to .env file."
    );
  }

  try {
    console.log(`🔢 Embedding ${texts.length} texts with OpenAI...`);

    const response = await axios.post(
      OPENAI_API_URL,
      {
        input: texts,
        model: EMBEDDING_MODEL,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const results: EmbeddingResult[] = response.data.data.map(
      (item: any, index: number) => ({
        text: texts[index],
        vector: item.embedding,
        model: EMBEDDING_MODEL,
      })
    );

    console.log(`✅ Embedding completed for ${results.length} texts`);
    return results;
  } catch (error: any) {
    if (error.response?.status === 429) {
      throw new Error(
        "OpenAI API quota exceeded. Please check your billing or wait for quota reset."
      );
    }
    console.error(
      "Embedding error:",
      error.response?.data || error.message
    );
    throw error;
  }
}

/**
 * Single text embedding
 */
export async function embedText(text: string): Promise<number[]> {
  const results = await embedTexts([text]);
  return results[0].vector;
}

/**
 * Process and embed document from file
 * 1. Insert document
 * 2. Chunk it
 * 3. Embed chunks
 * 4. Save to DB
 */
export async function processAndEmbedDocument(
  filename: string,
  content: string,
  sourceType: string = "policy",
  maxTokensPerChunk: number = 500
): Promise<{ docId: number; chunkCount: number }> {
  console.log(`\n📄 Processing document: ${filename}`);

  // Step 1: Insert document
  const doc = await db.insertDocument(filename, content, sourceType);
  console.log(`  ✅ Document inserted (ID: ${doc.id})`);

  // Step 2: Chunk document
  const chunks = chunkText(content, maxTokensPerChunk);
  console.log(`  ✂️  Created ${chunks.length} chunks`);

  // Step 3: Insert chunks
  const insertedChunks = await db.insertChunks(
    doc.id,
    chunks.map((c, i) => ({
      text: c,
      tokenCount: estimateTokens(c),
      order: i,
    }))
  );
  console.log(`  💾 Chunks saved to DB`);

  // Step 4: Embed chunks
  const embeddingResults = await embedTexts(chunks);

  // Step 5: Save embeddings
  for (let i = 0; i < insertedChunks.length; i++) {
    await db.insertEmbedding(
      insertedChunks[i].id,
      embeddingResults[i].vector,
      EMBEDDING_MODEL
    );
  }
  console.log(`  🔢 Embeddings saved to DB`);

  return { docId: doc.id, chunkCount: insertedChunks.length };
}

/**
 * Chunking: Split text into ~500 token chunks
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4); // Rough estimate: 1 token ≈ 4 chars
}

function chunkText(text: string, maxTokens: number = 500): string[] {
  const chunks: string[] = [];

  // Split by paragraphs first
  const paragraphs = text
    .split(/\n\n+/)
    .filter((p) => p.trim().length > 0);

  let currentChunk = "";

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    // If paragraph is too large, split by sentences
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
 * Cosine Similarity - for vector comparison
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have the same dimension");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

