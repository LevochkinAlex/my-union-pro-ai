import { Queue, Worker, type JobsOptions } from "bullmq";
import type { RedisOptions } from "ioredis";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRedisOptions } from "@/lib/redis";
import { processKnowledgeDocument } from "@/lib/knowledge/processor";

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

export type KnowledgeIngestionJob = {
  documentId: string;
};

const QUEUE_NAME = "knowledge-ingestion";

function createQueue(connection: RedisOptions) {
  const defaultJobOptions: JobsOptions = {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5_000,
    },
    removeOnComplete: 200,
    removeOnFail: 500,
  };

  const queue = new Queue<KnowledgeIngestionJob>(QUEUE_NAME, {
    connection,
    defaultJobOptions,
  });

  queue.on("error", (err) => {
    console.error("[knowledgeQueue] queue error", err);
  });

  return queue;
}

function createWorker(connection: RedisOptions) {
  const worker = new Worker<KnowledgeIngestionJob>(
    QUEUE_NAME,
    async (job) => {
      console.info(`[knowledgeQueue] processing document ${job.data.documentId}`);
      await processKnowledgeDocument(job.data.documentId);
    },
    { connection },
  );

  worker.on("failed", async (job, err) => {
    if (!job?.data?.documentId) return;

    const docWithSource = await prisma.knowledgeDocument.findUnique({
      where: { id: job.data.documentId },
      select: {
        id: true,
        sourceId: true,
        fileSize: true,
        mimeType: true,
        meta: true,
        source: {
          select: {
            metadata: true,
          },
        },
      },
    });

    await prisma.knowledgeDocument.update({
      where: { id: job.data.documentId },
      data: {
        processingStatus: "FAILED",
        meta: mergeMetadata(docWithSource?.meta, {
          ...(job.attemptsMade ? { attempts: job.attemptsMade } : {}),
          error: err.message,
        }),
      },
    });

    if (docWithSource?.sourceId) {
      await prisma.knowledgeSource.update({
        where: { id: docWithSource.sourceId },
        data: {
          status: "FAILED",
          metadata: mergeMetadata(docWithSource.source?.metadata, {
            ...(docWithSource.mimeType ? { mimeType: docWithSource.mimeType } : {}),
            size: docWithSource.fileSize,
            error: err.message,
          }),
          lastFetchedAt: new Date(),
        },
      });
    }

    console.error(`[knowledgeQueue] job failed for document ${job.data.documentId}:`, err);
  });

  worker.on("completed", (job) => {
    console.info(`[knowledgeQueue] completed document ${job.data.documentId}`);
  });

  worker.on("error", (err) => {
    console.error("[knowledgeQueue] worker error", err);
  });

  return { worker };
}

declare global {
  var __knowledgeQueue: Queue<KnowledgeIngestionJob> | undefined;
  var __knowledgeWorker:
    | {
        worker: Worker<KnowledgeIngestionJob>;
      }
    | undefined;
}

export function getKnowledgeQueue() {
  if (globalThis.__knowledgeQueue) {
    return globalThis.__knowledgeQueue;
  }

  const connection = getRedisOptions();
  if (!connection) {
    throw new Error(
      "[knowledgeQueue] Redis не настроен. Задайте REDIS_URL или уберите пустой REDIS_URL= для дефолта localhost:6379.",
    );
  }
  const queue = createQueue(connection);
  globalThis.__knowledgeQueue = queue;

  if (!globalThis.__knowledgeWorker) {
    console.info("[knowledgeQueue] starting worker");
    globalThis.__knowledgeWorker = createWorker(connection);
  }

  return queue;
}
