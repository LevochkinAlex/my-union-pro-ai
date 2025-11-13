# Async Document Processing with Bull Queue

## Overview

Async document processing uses **Bull** queue (backed by Redis) to process documents in the background without blocking the main application.

## Architecture

### Components

1. **Queue** (`lib/queue.ts`)
   - Manages Bull queue configuration
   - Handles job creation and status tracking
   - Provides queue statistics

2. **Worker** (`lib/workers/document-processor.ts`)
   - Processes documents in background
   - Extracts text, creates chunks, generates embeddings
   - Updates database with results

3. **Worker Process** (`scripts/worker.ts`)
   - Standalone Node process
   - Listens to queue and processes jobs
   - Handles retries and failures

4. **Admin API** (`app/api/admin/queue-status/route.ts`)
   - View queue statistics
   - Clear failed jobs

## Setup

### 1. Install Redis

**Local (Development)**
```bash
# macOS
brew install redis
brew services start redis

# Docker
docker run -d -p 6379:6379 redis:latest

# Linux
sudo apt-get install redis-server
sudo service redis-server start
```

**Production**
```bash
# Use managed Redis service (AWS ElastiCache, Upstash, etc.)
# Set REDIS_URL in environment
```

### 2. Configure Environment

```env
# .env.local or production env
REDIS_URL=redis://localhost:6379

# Or for production
REDIS_URL=redis://:password@redis-host.com:6379
```

### 3. Start Worker Process

**Development**
```bash
# Terminal 1: Start Next.js app
npm run dev

# Terminal 2: Start worker
npm run worker
```

**Production**
```bash
# Using PM2
pm2 start "npm run worker:prod" --name union-worker

# Or with Docker
docker run -e REDIS_URL=... node dist/scripts/worker.js

# Or with systemd
systemctl start union-worker
```

## Usage

### Automatic Processing

1. **Load Documents**
   ```bash
   npm run load-documents
   ```
   - Creates documents in DB
   - Automatically queues them for processing
   - Worker processes in background

2. **Monitor Progress**
   - Check admin dashboard `/admin/appeal-analytics`
   - View queue status via API

### Manual Queue Management

```typescript
import { addDocumentToQueue, getQueueStats, getJobStatus } from "@/lib/queue";

// Add document to queue
const job = await addDocumentToQueue({
  documentId: "doc-123",
  knowledgeBaseId: "kb-456",
  priority: "high", // low, normal, high
});

// Get job status
const status = await getJobStatus(job.id);

// Get queue stats
const stats = await getQueueStats();
// Returns: { waiting, active, completed, failed, delayed }
```

## API Endpoints

### Get Queue Status (Admin)
```
GET /api/admin/queue-status

Response:
{
  "success": true,
  "stats": {
    "waiting": 5,
    "active": 1,
    "completed": 42,
    "failed": 0,
    "delayed": 0,
    "paused": 0
  }
}
```

### Clear Failed Jobs (Admin)
```
DELETE /api/admin/queue-status

Response:
{
  "success": true,
  "message": "Failed jobs cleared"
}
```

## Job Lifecycle

```
┌─────────────────────────────────────┐
│ Document Added to Queue             │
│ Status: QUEUED                      │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Job Waiting in Queue                │
│ (may retry if failed)               │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Worker Picks Up Job                 │
│ Status: PROCESSING                  │
└──────────┬──────────────────────────┘
           │
           ├─ Extract text
           ├─ Create chunks
           ├─ Generate embeddings
           └─ Save to DB
           │
           ▼
┌─────────────────────────────────────┐
│ Job Complete                        │
│ Status: COMPLETED                   │
│ Auto-removed from queue             │
└─────────────────────────────────────┘
```

## Error Handling

### Automatic Retries
- **Failed jobs retry up to 3 times** (configurable)
- Exponential backoff: 2s, 4s, 8s between retries
- Failed jobs kept for analysis

### Manual Recovery
```bash
# Check failed jobs in Redis
redis-cli
> keys *failed*

# Clear failed jobs via API
DELETE /api/admin/queue-status

# Or via code
import { clearFailedJobs } from "@/lib/queue";
await clearFailedJobs();
```

## Monitoring

### View Queue Status
```bash
# Via Redis CLI
redis-cli
> KEYS bull:document-processing:*

# View active jobs
> LRANGE bull:document-processing:active 0 -1
```

### View in Bull Dashboard (Optional)
```bash
npm install bull-board

# Then add to API routes:
import { createBullBoard } from "@bull-board/api";
import { BullAdapter } from "@bull-board/api/bullAdapter";
import { ExpressAdapter } from "@bull-board/express";
```

## Performance Tuning

### Concurrency
```typescript
// In scripts/worker.ts
queue.process(DOCUMENT_PROCESSING_QUEUE, 5, handler); // Process 5 jobs concurrently
```

### Chunk Size
- Modify in `lib/knowledge/chunker.ts`
- Smaller chunks = more processing, more accuracy
- Larger chunks = faster processing, less accuracy

### Embedding Generation
- Batching: Process chunks in parallel
- Model: Choose faster embedding model if needed

## Troubleshooting

### Worker Not Picking Up Jobs
1. Check Redis is running: `redis-cli ping`
2. Verify REDIS_URL in environment
3. Check worker logs for errors
4. Restart worker process

### Jobs Stuck in Queue
```bash
# Check job state
npm run worker -- --inspect

# Clear and retry
DELETE /api/admin/queue-status
```

### High Memory Usage
- Reduce concurrency (process fewer jobs at once)
- Reduce chunk size
- Process documents in smaller batches

### Redis Connection Failed
```bash
# Test Redis connection
redis-cli ping

# Check credentials
echo "redis://:password@host:6379" | redis-cli -u

# Restart Redis
docker restart redis-container
# or
brew services restart redis
```

## Production Checklist

- ✅ Redis instance configured and running
- ✅ REDIS_URL environment variable set
- ✅ Worker process started (PM2, Docker, systemd, etc.)
- ✅ Monitor queue via API endpoint
- ✅ Set up alerts for failed jobs
- ✅ Regular backup of Redis data (if needed)
- ✅ Load balancer configured if multiple workers
- ✅ Logs aggregated from worker process

## Advanced

### Multiple Workers
```bash
# Scale horizontally
pm2 start "npm run worker:prod" -i 4  # 4 worker processes
```

### Custom Job Priorities
```typescript
await addDocumentToQueue(
  { documentId: "doc-123" },
  "high"  // Process this first
);
```

### Job Events
```typescript
import { getDocumentQueue } from "@/lib/queue";

const queue = getDocumentQueue();

queue.on("progress", (job, progress) => {
  console.log(`Job ${job.id} progress: ${progress}%`);
});

queue.on("completed", (job, result) => {
  console.log(`Job ${job.id} completed:`, result);
});

queue.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});
```

## Resources

- [Bull Documentation](https://optimalbits.github.io/bull/)
- [Redis Documentation](https://redis.io/documentation)
- [BullMQ (TypeScript version)](https://docs.bullmq.io/)

