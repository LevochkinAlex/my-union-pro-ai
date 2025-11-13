/**
 * Bull Queue setup for async document processing
 * Requires Redis connection
 */

import Bull from "bull";

// Queue names
export const DOCUMENT_PROCESSING_QUEUE = "document-processing";

// Create queues
let documentQueue: Bull.Queue | null = null;

export function getDocumentQueue(): Bull.Queue {
  if (!documentQueue) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

    documentQueue = new Bull(DOCUMENT_PROCESSING_QUEUE, redisUrl, {
      defaultJobOptions: {
        attempts: 3, // Retry failed jobs 3 times
        backoff: {
          type: "exponential",
          delay: 2000, // 2 seconds initial delay
        },
        removeOnComplete: true, // Remove job after completion
        removeOnFail: false, // Keep failed jobs for analysis
      },
      settings: {
        maxStalledCount: 2,
        stalledInterval: 30000, // Check for stalled jobs every 30s
        maxRetriesPerSecond: 5,
        retryProcessDelay: 5000, // Delay between retries
      },
    });

    // Event listeners
    documentQueue.on("completed", (job) => {
      console.log(`[Queue] Job ${job.id} completed:`, job.data);
    });

    documentQueue.on("failed", (job, err) => {
      console.error(`[Queue] Job ${job.id} failed:`, err.message);
    });

    documentQueue.on("error", (err) => {
      console.error("[Queue] Queue error:", err);
    });

    documentQueue.on("stalled", (job) => {
      console.warn(`[Queue] Job ${job.id} stalled, will retry`);
    });
  }

  return documentQueue;
}

/**
 * Close queue connection
 */
export async function closeQueues() {
  if (documentQueue) {
    await documentQueue.close();
    documentQueue = null;
  }
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
): Promise<Bull.Job> {
  const queue = getDocumentQueue();

  // Map priority to Bull priority (higher = processed first)
  const bullPriority = {
    high: 10,
    normal: 5,
    low: 1,
  }[priority || "normal"];

  const job = await queue.add(data, {
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
    progress: job.progress(),
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

  const counts = await queue.getJobCounts();

  return {
    waiting: counts.waiting,
    active: counts.active,
    completed: counts.completed,
    failed: counts.failed,
    delayed: counts.delayed,
    paused: counts.paused,
  };
}

/**
 * Clear failed jobs (admin only)
 */
export async function clearFailedJobs() {
  const queue = getDocumentQueue();
  const failedJobs = await queue.getFailed();
  
  for (const job of failedJobs) {
    await job.remove();
  }

  console.log(`[Queue] Cleared ${failedJobs.length} failed jobs`);
}

