#!/usr/bin/env node

/**
 * Standalone worker process for document processing
 * Run: npm run worker
 * Or in production: node dist/scripts/worker.js
 */

import { DOCUMENT_PROCESSING_QUEUE } from "@/lib/queue";
import { documentProcessorHandler, type DocumentProcessingJob } from "@/lib/workers/document-processor";
import { Worker } from "bullmq";
import { getRedisOptions } from "@/lib/redis";

async function startWorker() {
  try {
    console.log("🚀 Starting document processor worker...");

    const redisConn = getRedisOptions();
    if (!redisConn) {
      console.error("❌ REDIS_URL пустой — worker не запускается. Укажите Redis или уберите пустой REDIS_URL.");
      process.exit(1);
    }

    const worker = new Worker<DocumentProcessingJob>(
      DOCUMENT_PROCESSING_QUEUE,
      documentProcessorHandler,
      {
        connection: redisConn,
        concurrency: 1,
      }
    );

    await worker.waitUntilReady();

    console.log("✅ Worker started and listening for jobs");
    console.log(`   Queue: ${DOCUMENT_PROCESSING_QUEUE}`);
    console.log(`   Redis: ${process.env.REDIS_URL || "redis://localhost:6379"}`);

    // Keep process alive
    process.on("SIGTERM", async () => {
      console.log("\n⏹️  Shutting down worker...");
      await worker.close();
      process.exit(0);
    });

    process.on("SIGINT", async () => {
      console.log("\n⏹️  Shutting down worker...");
      await worker.close();
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Worker error:", error);
    process.exit(1);
  }
}

// Start worker
startWorker();

