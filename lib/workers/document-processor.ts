/**
 * Document Processor Worker
 * Handles async document processing from queue
 */

import { prisma } from "@/lib/prisma";
import { extractTextFromFile } from "@/lib/knowledge/extract";
import { chunkText } from "@/lib/knowledge/chunker";
import { generateEmbedding } from "@/lib/knowledge/embeddings";
import type Bull from "bull";
import path from "path";

export interface DocumentProcessingJob {
  documentId: string;
  userId?: string;
  knowledgeBaseId?: string;
  priority?: "low" | "normal" | "high";
}

/**
 * Process a single document
 * Extracted text, create chunks, generate embeddings
 */
export async function processDocument(
  job: Bull.Job<DocumentProcessingJob>
): Promise<{
  documentId: string;
  chunksCreated: number;
  textLength: number;
  status: "success" | "failed";
}> {
  const { documentId } = job.data;

  try {
    // Update status to processing
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: {
        processingStatus: "PROCESSING",
        meta: {
          startedAt: new Date().toISOString(),
        },
      },
    });

    // Fetch document details
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
      throw new Error(`Document ${documentId} not found`);
    }

    if (!document.filePath) {
      throw new Error("Document file path is missing");
    }

    // Extract text from file
    console.log(`[Worker] Extracting text from ${document.fileName}`);
    const absolutePath = path.join(
      process.cwd(),
      "public",
      document.filePath.replace(/^\//, "")
    );

    const text = await extractTextFromFile(
      absolutePath,
      document.mimeType ?? document.fileType ?? undefined
    );

    if (!text) {
      throw new Error("Failed to extract text from document");
    }

    console.log(`[Worker] Extracted ${text.length} characters from ${document.fileName}`);

    // Split into chunks
    const chunks = chunkText(text);
    console.log(`[Worker] Created ${chunks.length} chunks`);

    // Generate embeddings for each chunk
    console.log(`[Worker] Generating embeddings for ${chunks.length} chunks`);
    const embeddings = await Promise.all(
      chunks.map(async (chunk) => {
        const embedding = await generateEmbedding(chunk);
        return { content: chunk, embedding };
      })
    );

    console.log(`[Worker] Generated ${embeddings.length} embeddings`);

    // Save to database in transaction
    await prisma.$transaction(async (tx) => {
      // Delete old chunks
      await tx.knowledgeChunk.deleteMany({
        where: { documentId },
      });

      // Update document status
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

      // Create chunks
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

      // Update source if exists
      if (document.sourceId) {
        await tx.knowledgeSource.update({
          where: { id: document.sourceId },
          data: {
            status: "COMPLETED",
            metadata: {
              ...(document.source?.metadata || {}),
              mimeType: document.mimeType,
              size: document.fileSize,
              textLength: text.length,
              chunkCount: chunks.length,
              processedAt: new Date().toISOString(),
            },
            lastFetchedAt: new Date(),
          },
        });
      }
    });

    console.log(`[Worker] Document ${documentId} processing completed`);

    return {
      documentId,
      chunksCreated: embeddings.length,
      textLength: text.length,
      status: "success",
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Worker] Error processing document ${documentId}:`, errorMsg);

    // Update status to failed
    try {
      await prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: {
          processingStatus: "FAILED",
          meta: {
            failedAt: new Date().toISOString(),
            error: errorMsg,
          },
        },
      });
    } catch (updateError) {
      console.error("[Worker] Failed to update document status:", updateError);
    }

    throw error;
  }
}

/**
 * Job processor function to be used with Bull queue
 */
export async function documentProcessorHandler(
  job: Bull.Job<DocumentProcessingJob>
): Promise<any> {
  job.progress(0);

  try {
    const result = await processDocument(job);
    job.progress(100);
    return result;
  } catch (error) {
    console.error("[Worker] Job failed:", error);
    throw error;
  }
}

