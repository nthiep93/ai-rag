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

import * as db from "./db";
import { embedText } from "./embedding";

export interface RetrievedResult {
  chunkId: number;
  text: string;
  filename: string;
  similarity: number; // 0-1, cao hơn = tương tự hơn
}

/**
 * Retrieve relevant chunks from database based on query
 * 
 * @param question - User's question
 * @param topK - Number of top results to return (default 5)
 * @param minSimilarity - Minimum similarity threshold (default 0.3)
 * @returns Array of relevant chunks with similarity scores
 */
export async function retrieveRelevantChunks(
  question: string,
  topK: number = 5,
  minSimilarity: number = 0.3
): Promise<RetrievedResult[]> {
  try {
    console.log(`\n🔍 Retrieving relevant chunks for: "${question}"`);

    // Step 1: Embed the question
    console.log("  📝 Embedding question...");
    const queryEmbedding = await embedText(question);

    // Step 2: Search vector store in database
    console.log(`  📊 Searching vector DB (top-${topK}, similarity >= ${minSimilarity})...`);
    const searchResults = await db.similaritySearch(
      queryEmbedding,
      topK,
      minSimilarity
    );

    // Step 3: Format results
    const results: RetrievedResult[] = searchResults.map((row: any) => ({
      chunkId: row.chunk_id,
      text: row.text,
      filename: row.filename,
      similarity: row.similarity,
    }));

    console.log(`  ✅ Found ${results.length} relevant chunks\n`);

    return results;
  } catch (error) {
    console.error("Retrieval error:", error);
    throw error;
  }
}

/**
 * Build context string từ retrieved chunks
 * Ghép tất cả chunks thành 1 formatted context để gửi cho LLM
 */
export function buildContext(
  results: RetrievedResult[],
  includeMetadata: boolean = true
): string {
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
