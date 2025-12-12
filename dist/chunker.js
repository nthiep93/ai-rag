"use strict";
/**
 * CHUNKER MODULE
 * Chức năng: Cắt tài liệu dài thành các chunk nhỏ (~300-500 tokens)
 * Lý do: Giúp embedding được chính xác + context không quá dài
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.chunkText = chunkText;
exports.chunkMultipleDocs = chunkMultipleDocs;
/**
 * Ước tính số token (rough estimate)
 * Cách tính: 1 token ≈ 4 ký tự (dấu cách tính)
 */
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
/**
 * Cắt text theo đoạn (paragraph-aware)
 * Strategy: Cắt theo "\n\n" trước, nếu vẫn lớn → cắt theo sentence
 */
function chunkText(text, maxTokens = 500, source = "unknown") {
    const chunks = [];
    let chunkId = 0;
    // Bước 1: Split theo paragraph
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
    let currentChunk = "";
    for (const para of paragraphs) {
        const paraTokens = estimateTokens(para);
        // Nếu paragraph đơn lẻ quá lớn → split theo sentence
        if (paraTokens > maxTokens) {
            // Lưu chunk hiện tại (nếu có)
            if (currentChunk.trim()) {
                chunks.push({
                    id: `${source}-chunk-${chunkId}`,
                    text: currentChunk.trim(),
                    source,
                    order: chunkId,
                });
                chunkId++;
                currentChunk = "";
            }
            // Split paragraph theo câu
            const sentences = para.split(/(?<=[.!?])\s+/);
            let sentenceChunk = "";
            for (const sentence of sentences) {
                const sentTokens = estimateTokens(sentenceChunk + " " + sentence);
                if (sentTokens > maxTokens && sentenceChunk) {
                    chunks.push({
                        id: `${source}-chunk-${chunkId}`,
                        text: sentenceChunk.trim(),
                        source,
                        order: chunkId,
                    });
                    chunkId++;
                    sentenceChunk = sentence;
                }
                else {
                    sentenceChunk += (sentenceChunk ? " " : "") + sentence;
                }
            }
            if (sentenceChunk.trim()) {
                chunks.push({
                    id: `${source}-chunk-${chunkId}`,
                    text: sentenceChunk.trim(),
                    source,
                    order: chunkId,
                });
                chunkId++;
            }
        }
        else {
            // Nếu thêm vào chunk hiện tại vẫn OK → thêm
            const totalTokens = estimateTokens(currentChunk + "\n\n" + para);
            if (totalTokens > maxTokens && currentChunk.trim()) {
                // Lưu chunk hiện tại
                chunks.push({
                    id: `${source}-chunk-${chunkId}`,
                    text: currentChunk.trim(),
                    source,
                    order: chunkId,
                });
                chunkId++;
                currentChunk = para;
            }
            else {
                currentChunk += (currentChunk ? "\n\n" : "") + para;
            }
        }
    }
    // Lưu chunk cuối cùng
    if (currentChunk.trim()) {
        chunks.push({
            id: `${source}-chunk-${chunkId}`,
            text: currentChunk.trim(),
            source,
            order: chunkId,
        });
    }
    return chunks;
}
/**
 * Chunk nhiều tài liệu
 */
function chunkMultipleDocs(docs, maxTokens = 500) {
    const allChunks = [];
    for (const [source, text] of docs) {
        const chunks = chunkText(text, maxTokens, source);
        allChunks.push(...chunks);
    }
    return allChunks;
}
