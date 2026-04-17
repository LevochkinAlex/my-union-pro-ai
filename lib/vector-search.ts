import { prisma } from "@/lib/prisma";
import { EMBEDDING_DIM, generateQueryEmbedding } from "@/lib/knowledge/embeddings";

export interface RetrievedChunk {
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
  documentId?: string;
}

/**
 * Поиск релевантных chunks из базы знаний для бота.
 *
 * Использует Yandex `text-search-query` модель для вектора запроса и cosine
 * similarity против `KnowledgeChunk.embedding`. Чанки с несовпадающей
 * размерностью (устаревшие OpenRouter 1536/3072-dim) тихо пропускаются —
 * их должен перегенерировать скрипт `scripts/regen-embeddings-yandex.mjs`.
 */
export async function retrieveRelevantChunks(
  query: string,
  botId: string,
  limit: number = 5,
): Promise<RetrievedChunk[]> {
  try {
    const botKnowledgeBases = await prisma.chatBotKnowledgeBase.findMany({
      where: { chatBotId: botId },
      include: { knowledgeBase: true },
    });

    if (botKnowledgeBases.length === 0) {
      console.log("[vector-search] No knowledge bases found for bot:", botId);
      return [];
    }

    const knowledgeBaseIds = botKnowledgeBases.map((kb) => kb.knowledgeBaseId);

    const queryEmbedding = await generateQueryEmbedding(query);
    if (!queryEmbedding || queryEmbedding.length === 0) {
      console.warn("[vector-search] Failed to generate embedding for query");
      return [];
    }

    // Получаем все chunks из связанных баз знаний
    const allChunks = await prisma.knowledgeChunk.findMany({
      where: {
        knowledgeBaseId: {
          in: knowledgeBaseIds,
        },
      },
      include: {
        document: {
          select: {
            fileName: true,
            originalName: true,
          },
        },
      },
    });

    if (allChunks.length === 0) {
      console.log("[vector-search] No chunks found in knowledge bases");
      return [];
    }

    // Вычисляем косинусное сходство для каждого chunk, пропуская устаревшую размерность
    let skippedWrongDim = 0;
    const chunksWithSimilarity = allChunks
      .map((chunk) => {
        if (!chunk.embedding || chunk.embedding.length === 0) return null;
        if (chunk.embedding.length !== queryEmbedding.length) {
          skippedWrongDim++;
          return null;
        }

        let content = chunk.content;
        if (typeof content !== "string") {
          if (content && typeof content === "object") {
            content = JSON.stringify(content, null, 2);
          } else {
            content = String(content || "");
          }
        }

        const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
        return {
          content,
          similarity,
          metadata: (chunk.metadata as Record<string, unknown>) || {},
          documentId: chunk.documentId || undefined,
        };
      })
      .filter((chunk) => chunk !== null)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit) as RetrievedChunk[];

    if (skippedWrongDim > 0) {
      console.warn(
        `[vector-search] skipped ${skippedWrongDim} chunks with legacy embedding dim (expected ${EMBEDDING_DIM}). Run regen-embeddings-yandex.mjs`,
      );
    }

    console.log(
      `[vector-search] Found ${chunksWithSimilarity.length} relevant chunks for query`
    );

    return chunksWithSimilarity;
  } catch (error) {
    console.error("[vector-search] Error retrieving chunks:", error);
    return [];
  }
}

/**
 * Вычисляет косинусное сходство между двумя векторами
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

