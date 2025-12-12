/**
 * LLM MODULE v2 - WITH GUARDRAILS
 * Chức năng: Call OpenAI GPT API để generate answer từ context
 * 
 * Features:
 * - System prompts designed cho RAG (constraint-based)
 * - Temperature control
 * - Token usage tracking
 */

import axios from "axios";

export interface LLMResponse {
  answer: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LLM_MODEL = process.env.OPENAI_LLM_MODEL || "gpt-4-turbo";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * SYSTEM PROMPT - Define AI behavior for RAG
 * 
 * Guardrails:
 * 1. Only answer based on context
 * 2. Admit when info is insufficient
 * 3. Don't hallucinate or make up policies
 * 4. Be concise and structured
 * 5. Respond in Vietnamese
 */
const SYSTEM_PROMPT_POLICY = `You are a professional internal assistant for EADMIN company.

Your role: Help employees understand company policies, procedures, and guidelines.

Guidelines:
1. ONLY use the provided context to answer questions
2. If context doesn't contain enough information:
   - Say clearly: "Tôi không có đủ thông tin để trả lời câu hỏi này."
   - Suggest contacting relevant department (HR, IT, Finance, etc.)
3. DO NOT make up, invent, or assume policies
4. Format answer with clear structure: headings, bullet points, numbered lists
5. Keep answer concise but complete
6. Respond in Vietnamese
7. Always cite the source document when relevant

Remember: You are a helper, not a decision maker. Encourage employees to verify with official channels.`;

const SYSTEM_PROMPT_ITSM = `You are a professional IT Support Assistant for EADMIN company.

Your role: Help employees understand IT processes, incidents, requests, and troubleshooting.

Guidelines:
1. ONLY reference the provided IT documentation
2. If solution is not in docs:
   - Say: "Tôi không tìm thấy giải pháp trong tài liệu. Vui lòng liên hệ IT Support hotline..."
   - Provide IT contact info if available
3. DO NOT provide unauthorized troubleshooting advice
4. Structure answer clearly: problem → solution → steps → contact
5. Be friendly but professional
6. Respond in Vietnamese
7. Always ask if additional info is needed`;

const SYSTEM_PROMPTS: Record<string, string> = {
  policy: SYSTEM_PROMPT_POLICY,
  itsm: SYSTEM_PROMPT_ITSM,
  default: SYSTEM_PROMPT_POLICY,
};

/**
 * Generate answer using OpenAI
 * 
 * @param context - Retrieved context from vector DB
 * @param question - User's question
 * @param systemPrompt - System prompt to guide LLM behavior (optional)
 * @returns LLM response with answer + token usage
 */
export async function generateAnswer(
  context: string,
  question: string,
  systemPrompt?: string
): Promise<LLMResponse> {
  if (!OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set. Please add your API key to .env"
    );
  }

  const finalSystemPrompt = systemPrompt || SYSTEM_PROMPT_POLICY;

  try {
    console.log(`🤖 Calling LLM (${LLM_MODEL}) to generate answer...`);

    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: LLM_MODEL,
        messages: [
          {
            role: "system",
            content: finalSystemPrompt,
          },
          {
            role: "user",
            content: buildUserPrompt(context, question),
          },
        ],
        temperature: 0.7, // Balanced: creative but not too random
        max_tokens: 1000,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const message = response.data.choices[0].message.content;
    const usage = response.data.usage;

    console.log(
      `  ✅ Answer generated (${usage.completion_tokens} completion tokens)`
    );

    return {
      answer: message,
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
    };
  } catch (error: any) {
    if (error.response?.status === 429) {
      throw new Error("OpenAI API quota exceeded. Please check your billing.");
    }
    console.error("LLM error:", error.response?.data || error.message);
    throw error;
  }
}

/**
 * Build user prompt with context + question
 */
function buildUserPrompt(context: string, question: string): string {
  return `Based on the following context, answer the question.

Context:
--------
${context}

Question:
---------
${question}

Answer:`;
}

/**
 * Get system prompt by document type
 */
export function getSystemPromptByType(docType: string): string {
  return SYSTEM_PROMPTS[docType] || SYSTEM_PROMPTS.default;
}

/**
 * Build full RAG pipeline response
 */
export interface RAGResponse {
  question: string;
  answer: string;
  sources: Array<{ source: string; relevance: number }>;
  llmUsage: LLMResponse["usage"];
}
