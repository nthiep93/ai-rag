/**
 * RETRIEVER MODULE
 * Chức năng: Tìm Top-K chunks tương tự với query
 * Strategy: In-memory vector store (array + cosine similarity)
 */

import { cosineSimilarity, embedText } from "./embedding";

interface VectorizedChunk {
  id: string;
  text: string;
  vector: number[];
  source: string;
  order: number;
}

interface RetrievalResult {
  chunk: VectorizedChunk;
  similarity: number;
}

/**
 * In-memory Vector Store
 * Lưu trữ: ID, text, vector, metadata (source, order)
 */
export class VectorStore {
  private chunks: VectorizedChunk[] = [];

  /**
   * Thêm chunk vào vector store
   */
  addChunk(chunk: VectorizedChunk): void {
    this.chunks.push(chunk);
  }

  /**
   * Thêm nhiều chunks
   */
  addChunks(chunks: VectorizedChunk[]): void {
    this.chunks.push(...chunks);
  }

  /**
   * Tìm Top-K chunks tương tự với query vector
   */
  search(queryVector: number[], topK: number = 5): RetrievalResult[] {
    const results: RetrievalResult[] = this.chunks.map((chunk) => ({
      chunk,
      similarity: cosineSimilarity(queryVector, chunk.vector),
    }));

    // Sort by similarity (descending)
    results.sort((a, b) => b.similarity - a.similarity);

    // Return top K
    return results.slice(0, topK);
  }

  /**
   * Get store statistics
   */
  getStats(): { totalChunks: number; sources: Set<string> } {
    const sources = new Set(this.chunks.map((c) => c.source));
    return {
      totalChunks: this.chunks.length,
      sources,
    };
  }

  /**
   * Clear store (for reset)
   */
  clear(): void {
    this.chunks = [];
  }
}

/**
 * Retriever class - bao gói việc query + rank
 */
export class Retriever {
  private vectorStore: VectorStore;

  constructor(vectorStore: VectorStore) {
    this.vectorStore = vectorStore;
  }

  /**
   * Query: embed câu hỏi → tìm top-k chunks
   */
  async retrieve(
    question: string,
    topK: number = 5,
    minSimilarity: number = 0.3
  ): Promise<RetrievalResult[]> {
    try {
      // Bước 1: Embed câu hỏi
      console.log("🔍 Embedding query...");
      const queryVector = await embedText(question);

      // Bước 2: Tìm top-k
      console.log(`📊 Searching for top-${topK} similar chunks...`);
      let results = this.vectorStore.search(queryVector, topK);

      // Bước 3: Filter by minimum similarity threshold
      results = results.filter((r) => r.similarity >= minSimilarity);

      console.log(`✅ Found ${results.length} relevant chunks`);
      return results;
    } catch (error) {
      console.error("Retrieval error:", error);
      throw error;
    }
  }
}

/**
 * Context Builder: ghép chunks thành 1 context string
 */
export function buildContext(
  results: RetrievalResult[],
  includeMetadata: boolean = true
): string {
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
