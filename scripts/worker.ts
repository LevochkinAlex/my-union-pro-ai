#!/usr/bin/env node

/**
 * Standalone worker process for document processing
 * Run: npm run worker
 * Or in production: node dist/scripts/worker.js
 */

import { getDocumentQueue, DOCUMENT_PROCESSING_QUEUE } from "@/lib/queue";
import { documentProcessorHandler } from "@/lib/workers/document-processor";

async function startWorker() {
  try {
    console.log("🚀 Starting document processor worker...");

    const queue = getDocumentQueue();

    // Process jobs
    await queue.process(
      DOCUMENT_PROCESSING_QUEUE,
      1, // Process 1 job at a time (can increase for parallelism)
      documentProcessorHandler
    );

    console.log("✅ Worker started and listening for jobs");
    console.log(`   Queue: ${DOCUMENT_PROCESSING_QUEUE}`);
    console.log(`   Redis: ${process.env.REDIS_URL || "redis://localhost:6379"}`);

    // Keep process alive
    process.on("SIGTERM", async () => {
      console.log("\n⏹️  Shutting down worker...");
      await queue.close();
      process.exit(0);
    });

    process.on("SIGINT", async () => {
      console.log("\n⏹️  Shutting down worker...");
      await queue.close();
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Worker error:", error);
    process.exit(1);
  }
}

// Start worker
startWorker();

