---
name: pikku-queue-bullmq
description: Run background queue workers using BullMQ and Redis. Use for reliable job processing, delayed tasks, job priorities, retries, and result tracking.
tags: [pikku, bullmq, redis, queue, worker, background-jobs, runtime]
---

# Pikku BullMQ Queue Runtime

This skill helps you set up background queue workers using BullMQ and Redis for reliable job processing.

## When to use this skill

- Reliable background job processing
- Job result tracking and monitoring
- Job priorities and delays
- Automatic retries with exponential backoff
- High-throughput Redis-based queuing
- Job progress tracking
- Job lifecycle events (completed, failed, stalled)
- Distributed worker pools
- Need for job persistence and durability

**Performance:** BullMQ uses Redis for near-instant job delivery via pub/sub, eliminating polling overhead.

## Quick Setup

**Prerequisites:** See [pikku-project-setup](/skills/pikku-project-setup) for project structure detection and common setup patterns.

### 1. Install Packages

```bash
npm install @pikku/queue-bullmq @pikku/core bullmq ioredis
```

### 2. Create Worker File

**Standalone:** Create `src/start.ts` based on [templates/bullmq/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/bullmq/src/start.ts)

**Workspace:** Create worker file importing from functions package

**Key imports:**

- Import bootstrap from **queue subdirectory** (see [pikku-project-setup](/skills/pikku-project-setup) for queue bootstrap paths)
- Standalone: `./.pikku/queue/pikku-bootstrap-queue.gen.js`
- Workspace: `@my-app/functions/.pikku/queue/pikku-bootstrap-queue.gen.js`
- Import `BullQueueWorkers` from `@pikku/queue-bullmq`
- Import config, services, and session factory

### 3. Configure Redis Connection

```typescript
const redisConnectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
}

const bullQueueWorkers = new BullQueueWorkers(
  redisConnectionOptions,
  singletonServices,
  createSessionServices
)
```

### 4. Setup Queue Service (for enqueuing)

Add `BullQueueService` to singleton services in your HTTP/channel handlers:

```typescript
import { BullQueueService } from '@pikku/queue-bullmq'

const queue = new BullQueueService(redisConnectionOptions)
```

### 5. Update Package.json Scripts

See [pikku-project-setup](/skills/pikku-project-setup) for complete script patterns. Queue workers use same scripts as Express/Fastify.

### 6. Generate & Verify

```bash
# Generate wiring (if applicable to your project type)
npm run pikku

# Start worker
npm run dev

# Verify worker is processing (check logs)
```

**Expected outcome:** Worker starts, connects to Redis, registers queue processors, begins processing jobs. Jobs added via `queue.add()` are processed by workers.

---

## Installation

```bash
npm install @pikku/queue-bullmq @pikku/core bullmq ioredis
```

---

## Setup

### Standalone Project

For standalone projects where functions are in the same package.

**Example:** [templates/bullmq/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/bullmq/src/start.ts)

**Pattern:**

```typescript
import { BullQueueWorkers } from '@pikku/queue-bullmq'
import {
  createConfig,
  createSingletonServices,
  createSessionServices,
} from './services.js'
import './.pikku/queue/pikku-bootstrap-queue.gen.js'

async function main(): Promise<void> {
  const config = await createConfig()
  const singletonServices = await createSingletonServices(config)

  singletonServices.logger.info('Starting Bull queue workers...')

  const bullQueueWorkers = new BullQueueWorkers(
    {}, // Redis connection options
    singletonServices,
    createSessionServices
  )

  await bullQueueWorkers.registerQueues()
}

main()
```

**Key points:**

- Import bootstrap from `./.pikku/queue/pikku-bootstrap-queue.gen.js` (note `/queue/` directory)
- Create `BullQueueWorkers` with Redis connection, services, and session factory
- Call `registerQueues()` to start processing
- Worker runs continuously until process exits

### Workspace Project

Backend imports functions from the functions package.

**Pattern:**

```typescript
import { BullQueueWorkers } from '@pikku/queue-bullmq'
import {
  createConfig,
  createSingletonServices,
  createSessionServices,
} from '@my-app/functions/src/services'
import '@my-app/functions/.pikku/queue/pikku-bootstrap-queue.gen.js'

async function main(): Promise<void> {
  const config = await createConfig()
  const singletonServices = await createSingletonServices(config)

  const bullQueueWorkers = new BullQueueWorkers(
    {},
    singletonServices,
    createSessionServices
  )

  await bullQueueWorkers.registerQueues()
}

main()
```

**Key differences:**

- Import config/services from functions package
- Import bootstrap from functions: `@my-app/functions/.pikku/queue/pikku-bootstrap-queue.gen.js`
- No custom filtering support for queue workers

---

## Redis Configuration

BullMQ requires Redis connection configuration.

**Pattern:**

```typescript
import { ConnectionOptions } from 'bullmq'

const redisConnectionOptions: ConnectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),

  // TLS for production
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,

  // Connection retry strategy
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
}

const bullQueueWorkers = new BullQueueWorkers(
  redisConnectionOptions,
  singletonServices,
  createSessionServices
)
```

**Redis URL:** You can also use a connection string:

```typescript
const redisConnectionOptions = {
  connection: 'redis://user:password@host:6379/0',
}
```

**Production tips:**

- Use Redis Cluster for high availability
- Enable TLS for secure connections
- Use connection pooling for multiple workers
- Set appropriate timeout values

---

## Queue Service (Enqueuing Jobs)

Use `BullQueueService` to add jobs to queues from your HTTP/channel handlers.

**Setup in services:**

```typescript
import { BullQueueService } from '@pikku/queue-bullmq'
import type { QueueService } from '@pikku/core/queue'

export const createSingletonServices = async (config: Config) => {
  const queue: QueueService = new BullQueueService({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
  })

  return {
    queue,
    logger,
    // ... other services
  }
}
```

**Adding jobs:**

```typescript
// In your Pikku function
await services.queue.add('emailQueue', {
  to: 'user@example.com',
  subject: 'Welcome!',
  body: 'Thanks for signing up',
})

// With options
await services.queue.add('emailQueue', data, {
  priority: 1, // Higher priority = processed first
  delay: 5000, // Delay 5 seconds before processing
  attempts: 3, // Retry up to 3 times
  jobId: 'unique-id', // Deduplicate jobs
  removeOnComplete: 10, // Keep last 10 completed jobs
  removeOnFail: 50, // Keep last 50 failed jobs
})
```

**Job options:**

- `priority`: Job priority (lower number = higher priority)
- `delay`: Delay in milliseconds before processing
- `attempts`: Number of retry attempts
- `jobId`: Custom job ID for deduplication
- `removeOnComplete`: Number of completed jobs to keep
- `removeOnFail`: Number of failed jobs to keep

**See:** [pikku-queue skill](/skills/pikku-queue) for queue function definitions and enqueue patterns.

---

## Worker Configuration

Configure worker behavior using `workerConfig` in your queue function definition.

**Example:**

```typescript
import { defineQueue } from '@pikku/core/queue'

export const sendEmailQueue = defineQueue({
  func: sendEmail,
  queueName: 'emailQueue',
  workerConfig: {
    name: 'email-worker',
    batchSize: 5, // Process 5 jobs concurrently
    autorun: true, // Start processing automatically
    lockDuration: 30000, // Job lock duration (30s)
    drainDelay: 5, // Poll delay when queue empty (5ms)
    maxStalledCount: 3, // Max recoveries from stalled state
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500, // Keep last 500 failed jobs
  },
})
```

**Worker config options:**

| Option             | Description                 | BullMQ Mapping     |
| ------------------ | --------------------------- | ------------------ |
| `name`             | Worker identifier           | `name`             |
| `batchSize`        | Concurrent job processing   | `concurrency`      |
| `autorun`          | Auto-start processing       | `autorun`          |
| `lockDuration`     | Job lock duration (ms)      | `lockDuration`     |
| `drainDelay`       | Empty queue poll delay (ms) | `drainDelay`       |
| `maxStalledCount`  | Max stalled recoveries      | `maxStalledCount`  |
| `removeOnComplete` | Keep N completed jobs       | `removeOnComplete` |
| `removeOnFail`     | Keep N failed jobs          | `removeOnFail`     |

**Unsupported options:**

- `visibilityTimeout`: BullMQ uses locks instead
- `pollInterval`: BullMQ is push-based (pub/sub)
- `prefetch`: BullMQ manages automatically

---

## Job Lifecycle

**Job states:**

1. **waiting**: Job added to queue
2. **active**: Job being processed
3. **completed**: Job finished successfully
4. **failed**: Job failed after all retries
5. **delayed**: Job scheduled for future processing
6. **stalled**: Job exceeded lock duration

**Progress tracking:**

```typescript
async function processVideo(
  data: VideoData,
  services: Services,
  job: QueueJob
) {
  // Update progress
  await job.updateProgress(25)
  // ... do work ...
  await job.updateProgress(50)
  // ... more work ...
  await job.updateProgress(100)

  return { videoUrl: 'https://...' }
}
```

**Job control:**

```typescript
// Fail job with custom error
throw new QueueJobFailedError('Invalid video format')

// Discard job (don't retry)
throw new QueueJobDiscardedError('Job no longer needed')
```

---

## Development

### Scripts

**Standalone:**

```json
{
  "scripts": {
    "pikku": "pikku all",
    "prebuild": "npm run pikku",
    "dev": "tsx --watch src/start.ts",
    "start": "tsx src/start.ts"
  }
}
```

**Workspace:**

```json
{
  "scripts": {
    "dev": "tsx --watch src/start.ts",
    "start": "tsx src/start.ts"
  }
}
```

### Local Development

Run Redis locally:

```bash
# Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or use docker-compose
docker-compose up redis
```

Start worker:

```bash
npm run dev
```

---

## Deployment

### Docker

BullMQ workers can run in containers alongside your HTTP servers or as dedicated worker instances.

**Example Dockerfile:**

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
CMD ["node", "dist/start.js"]
```

### Scaling Workers

Run multiple worker instances for horizontal scaling:

```bash
# Docker Compose
docker-compose up --scale worker=5
```

**Key points:**

- Multiple workers automatically share jobs
- Use worker names for monitoring
- Scale based on queue depth and job duration
- Monitor Redis memory usage

### Environment Variables

```bash
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=your-password
REDIS_DB=0
REDIS_TLS=true
NODE_ENV=production
```

---

## Monitoring

### Bull Board

Use Bull Board for web-based queue monitoring:

```bash
npm install @bull-board/api @bull-board/express
```

**Setup:**

```typescript
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'

const serverAdapter = new ExpressAdapter()
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
})

app.use('/admin/queues', serverAdapter.getRouter())
```

**Access at:** `http://localhost:3000/admin/queues`

### Metrics

Monitor key metrics:

- Queue depth (waiting jobs)
- Processing rate (jobs/second)
- Completion rate
- Failure rate
- Stalled jobs
- Average processing time
- Redis memory usage

---

## Performance Tips

- **Concurrency:** Use `batchSize` to process multiple jobs in parallel
- **Job retention:** Limit `removeOnComplete` and `removeOnFail` to prevent memory bloat
- **Lock duration:** Set `lockDuration` > job processing time to prevent stalls
- **Redis optimization:** Use Redis Cluster for high throughput
- **Job size:** Keep job data small (use references to large data)
- **Priorities:** Use sparingly (adds overhead)
- **Backoff:** Configure exponential backoff for retries

**Redis memory management:**

```typescript
workerConfig: {
  removeOnComplete: 10,   // Keep minimal completed jobs
  removeOnFail: 100,      // Keep failed jobs for debugging
}
```

---

## Examples

**Standalone:**

- [templates/bullmq](https://github.com/vramework/pikku/tree/main/templates/bullmq) - BullMQ worker

---

## Critical Rules

### Standalone Projects

- [ ] Import bootstrap from: `./.pikku/queue/pikku-bootstrap-queue.gen.js` (note `/queue/` directory)
- [ ] Import services from local files
- [ ] Create `BullQueueWorkers` with Redis connection, singleton services, and session factory
- [ ] Call `await registerQueues()` to start processing
- [ ] Handle process signals for graceful shutdown

### Workspace Projects

- [ ] Import config/services from functions: `@my-app/functions/src/...`
- [ ] Import bootstrap from functions: `@my-app/functions/.pikku/queue/pikku-bootstrap-queue.gen.js`
- [ ] Backend package.json has `"@my-app/functions": "workspace:*"`

### Redis Configuration

- [ ] Configure Redis connection (host, port, password)
- [ ] Enable TLS for production
- [ ] Set connection retry strategy
- [ ] Use Redis Cluster for high availability
- [ ] Monitor Redis memory usage

### Service Integration

- [ ] Add `BullQueueService` to singleton services for enqueuing jobs
- [ ] Use same Redis configuration for both workers and service
- [ ] Configure job options (priority, delay, attempts) appropriately

### Worker Configuration

- [ ] Set appropriate `batchSize` for concurrency
- [ ] Configure `lockDuration` > job processing time
- [ ] Limit `removeOnComplete` and `removeOnFail` to prevent memory bloat
- [ ] Use worker `name` for monitoring and identification

### Development

- [ ] Run Redis locally (Docker recommended)
- [ ] Use `tsx --watch` for development
- [ ] Monitor queue depth and processing rate
- [ ] Test failure scenarios and retries

### Deployment

- [ ] Use environment variables for Redis config
- [ ] Scale workers horizontally as needed
- [ ] Monitor queue metrics (depth, rate, failures)
- [ ] Set up Bull Board for monitoring
- [ ] Configure graceful shutdown

### Performance

- [ ] Keep job data small (use references)
- [ ] Use priorities sparingly
- [ ] Configure exponential backoff for retries
- [ ] Optimize `batchSize` based on job duration
- [ ] Monitor and optimize Redis memory usage

---

## Related Skills

**Prerequisites:**

- [pikku-project-setup](/skills/pikku-project-setup) - Project structure and common setup patterns
- [pikku-functions](/skills/pikku-functions) - Creating Pikku function definitions

**Wiring:**

- [pikku-queue](/skills/pikku-queue) - Queue function definitions and enqueue patterns

**Alternative Queue Runtimes:**

- [pikku-queue-pg-boss](/skills/pikku-queue-pg-boss) - PostgreSQL-based queue alternative (no Redis required)
