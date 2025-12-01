import { prisma } from "@/lib/prisma";
import { generateEmbedding } from "@/lib/knowledge/embeddings";

export interface RetrievedChunk {
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
  documentId?: string;
}

/**
 * Поиск релевантных chunks из базы знаний для бота
 */
export async function retrieveRelevantChunks(
  query: string,
  botId: string,
  limit: number = 5
): Promise<RetrievedChunk[]> {
  try {
    // Получаем базы знаний, связанные с ботом
    const botKnowledgeBases = await prisma.chatBotKnowledgeBase.findMany({
      where: { chatBotId: botId },
      include: {
        knowledgeBase: true,
      },
    });

    if (botKnowledgeBases.length === 0) {
      console.log("[vector-search] No knowledge bases found for bot:", botId);
      return [];
    }

    const knowledgeBaseIds = botKnowledgeBases.map((kb) => kb.knowledgeBaseId);

    // Генерируем embedding для запроса
    const queryEmbedding = await generateEmbedding(query);
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

    // Вычисляем косинусное сходство для каждого chunk
    const chunksWithSimilarity = allChunks
      .map((chunk) => {
        if (!chunk.embedding || chunk.embedding.length === 0) {
          return null;
        }

        const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
        return {
          content: chunk.content,
          similarity,
          metadata: (chunk.metadata as Record<string, unknown>) || {},
          documentId: chunk.documentId || undefined,
        };
      })
      .filter((chunk) => chunk !== null)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit) as RetrievedChunk[];

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

