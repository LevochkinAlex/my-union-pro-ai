import path from "path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { extractTextFromFile } from "@/lib/knowledge/extract";
import { chunkText } from "@/lib/knowledge/chunker";
import { generateEmbedding } from "@/lib/knowledge/embeddings";

function mergeMetadata(existing: Prisma.JsonValue | null | undefined, updates: Record<string, unknown>) {
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return {
      ...existing,
      ...updates,
    } as Prisma.JsonValue;
  }
  return updates;
}

export async function processKnowledgeDocument(documentId: string) {
  const document = await prisma.knowledgeDocument.findUnique({
    where: { id: documentId },
    include: {
      knowledgeBase: true,
      source: {
        select: {
          id: true,
          metadata: true,
        },
      },
    },
  });

  if (!document) {
    throw new Error(`Knowledge document ${documentId} not found`);
  }

  await prisma.knowledgeDocument.update({
    where: { id: documentId },
    data: {
      processingStatus: "PROCESSING",
      meta: {
        startedAt: new Date().toISOString(),
      },
    },
  });

  if (document.sourceId) {
    await prisma.knowledgeSource.update({
      where: { id: document.sourceId },
      data: {
        status: "PROCESSING",
        lastFetchedAt: new Date(),
      },
    });
  }

  if (!document.filePath) {
    throw new Error("Document file path is missing");
  }

  const absolutePath = path.join(process.cwd(), "public", document.filePath.replace(/^\//, ""));
  const text = await extractTextFromFile(absolutePath, document.mimeType ?? document.fileType ?? undefined);

  if (!text) {
    throw new Error("Не удалось извлечь текст из документа");
  }

  const chunks = chunkText(text);

  const embeddings = await Promise.all(
    chunks.map(async (chunk) => ({
      content: chunk,
      embedding: await generateEmbedding(chunk),
    })),
  );

  await prisma.$transaction(async (tx) => {
    await tx.knowledgeChunk.deleteMany({
      where: { documentId },
    });

    await tx.knowledgeDocument.update({
      where: { id: documentId },
      data: {
        extractedText: text,
        processingStatus: "COMPLETED",
        processedAt: new Date(),
        meta: {
          completedAt: new Date().toISOString(),
          chunkCount: chunks.length,
          textLength: text.length,
        },
      },
    });

    if (embeddings.length > 0) {
      await tx.knowledgeChunk.createMany({
        data: embeddings.map(({ content, embedding }) => ({
          knowledgeBaseId: document.knowledgeBaseId,
          documentId,
          content,
          tokens: content.length,
          embedding,
        })),
      });
    }

    if (document.sourceId) {
      await tx.knowledgeSource.update({
        where: { id: document.sourceId },
        data: {
          status: "COMPLETED",
          metadata: mergeMetadata(document.source?.metadata, {
            ...(document.mimeType ? { mimeType: document.mimeType } : {}),
            size: document.fileSize,
            textLength: text.length,
            chunkCount: chunks.length,
          }),
          lastFetchedAt: new Date(),
        },
      });
    }
  });
}
