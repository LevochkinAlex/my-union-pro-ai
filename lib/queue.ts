/**
 * BullMQ Queue setup for async document processing
 * Requires Redis connection
 */

import { Queue, QueueEvents, Job } from "bullmq";
import { getRedisOptions } from "./redis";

// Queue names
export const DOCUMENT_PROCESSING_QUEUE = "document-processing";

type BullQueue = Queue<DocumentProcessingJob, any, string>;

// Create queues
let documentQueue: BullQueue | null = null;
let documentQueueEvents: QueueEvents | null = null;

function getQueueConnection() {
  const opts = getRedisOptions();
  if (!opts) {
    throw new Error(
      "[Queue] Redis отключён (REDIS_URL=). Очередь документов недоступна — задайте REDIS_URL или уберите пустое значение.",
    );
  }
  return opts;
}

export function getDocumentQueue(): BullQueue {
  if (!documentQueue) {
    const connection = getQueueConnection();

    documentQueue = new Queue(DOCUMENT_PROCESSING_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: 3, // Retry failed jobs 3 times
        backoff: {
          type: "exponential",
          delay: 2000, // 2 seconds initial delay
        },
        removeOnComplete: true, // Remove job after completion
        removeOnFail: false, // Keep failed jobs for analysis
      },
    });

    documentQueueEvents = new QueueEvents(DOCUMENT_PROCESSING_QUEUE, {
      connection,
    });

    documentQueueEvents.on("completed", ({ jobId }) => {
      console.log(`[Queue] Job ${jobId} completed`);
    });

    documentQueueEvents.on("failed", ({ jobId, failedReason }) => {
      console.error(`[Queue] Job ${jobId} failed:`, failedReason);
    });

    documentQueueEvents.on("error", (err) => {
      console.error("[Queue] Queue error:", err);
    });
  }

  return documentQueue;
}

/**
 * Job data type for document processing
 */
export interface DocumentProcessingJob {
  documentId: string;
  userId?: string;
  knowledgeBaseId?: string;
  priority?: "low" | "normal" | "high";
}

/**
 * Add document to processing queue
 */
export async function addDocumentToQueue(
  data: DocumentProcessingJob,
  priority?: "low" | "normal" | "high"
): Promise<Job> {
  const queue = getDocumentQueue();

  // Map priority to Bull priority (higher = processed first)
  const bullPriority = {
    high: 10,
    normal: 5,
    low: 1,
  }[priority || "normal"];

  const job = await queue.add(data.documentId, data, {
    priority: bullPriority,
    jobId: `doc-${data.documentId}-${Date.now()}`,
  });

  console.log(`[Queue] Document ${data.documentId} added to queue:`, job.id);
  return job;
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string) {
  const queue = getDocumentQueue();
  const job = await queue.getJob(jobId);

  if (!job) {
    return null;
  }

  return {
    id: job.id,
    state: await job.getState(),
    progress: (typeof job.progress === "number" ? job.progress : 0) ?? 0,
    attempts: job.attemptsMade,
    maxAttempts: job.opts.attempts,
    data: job.data,
    failedReason: job.failedReason,
    stacktrace: job.stacktrace,
  };
}

/**
 * Get queue stats
 */
export async function getQueueStats() {
  const queue = getDocumentQueue();

  const counts = await queue.getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
    "paused"
  );

  return {
    waiting: counts.waiting || 0,
    active: counts.active || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0,
    delayed: counts.delayed || 0,
    paused: counts.paused || 0,
  };
}

/**
 * Clear failed jobs (admin only)
 */
export async function clearFailedJobs() {
  const queue = getDocumentQueue();
  const failedJobs = await queue.getJobs(["failed"], 0, -1, false);
  
  for (const job of failedJobs) {
    await job.remove();
  }

  console.log(`[Queue] Cleared ${failedJobs.length} failed jobs`);
}

