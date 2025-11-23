import path from "path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { extractTextFromFile } from "@/lib/knowledge/extract";
import { chunkText } from "@/lib/knowledge/chunker";
import { generateEmbedding } from "@/lib/knowledge/embeddings";

function mergeMetadata(
  existing: Prisma.JsonValue | null | undefined,
  updates: Record<string, unknown>,
): Prisma.InputJsonValue {
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return {
      ...(existing as Record<string, unknown>),
      ...updates,
    } as Prisma.InputJsonValue;
  }
  return updates as Prisma.InputJsonValue;
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

  // Извлекаем текст в зависимости от типа источника
  let text: string;
  
  if (document.fileType === "text" && document.meta && typeof document.meta === "object") {
    // Текст из meta (ручное добавление)
    const meta = document.meta as Record<string, unknown>;
    text = typeof meta.textContent === "string" ? meta.textContent : "";
    if (!text) {
      throw new Error("Текстовый контент не найден в meta");
    }
  } else if (document.fileType === "url" && document.filePath) {
    // TODO: Извлечение текста из URL (требуется библиотека для парсинга HTML)
    // Пока используем заглушку
    text = `URL: ${document.filePath}`;
    console.warn(`[knowledge] URL parsing not yet implemented for ${document.filePath}`);
  } else if (document.filePath) {
    // Текст из файла
    const absolutePath = path.join(process.cwd(), "public", document.filePath.replace(/^\//, ""));
    text = await extractTextFromFile(absolutePath, document.mimeType ?? document.fileType ?? undefined);
    
    if (!text) {
      throw new Error("Не удалось извлечь текст из документа");
    }
  } else {
    throw new Error("Невозможно извлечь текст: нет ни filePath, ни textContent в meta");
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
