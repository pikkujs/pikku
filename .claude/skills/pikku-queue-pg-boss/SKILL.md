---
name: pikku-queue-pg-boss
description: Run background queue workers using PG-Boss and PostgreSQL. Use for reliable job processing with PostgreSQL as the backing store, no Redis required.
tags: [pikku, pg-boss, postgresql, queue, worker, background-jobs, runtime]
---

# Pikku PG-Boss Queue Runtime

This skill helps you set up background queue workers using PG-Boss and PostgreSQL for reliable job processing.

## When to use this skill

- PostgreSQL-based job queue (no Redis required)
- Already using PostgreSQL database
- Need job persistence and durability
- Job result tracking and monitoring
- Job priorities and delays
- Automatic retries with database-backed state
- Simpler infrastructure (one less service)
- ACID transaction guarantees for jobs
- Built-in job archival and cleanup

**vs BullMQ:** PG-Boss uses PostgreSQL instead of Redis. Choose PG-Boss if you prefer PostgreSQL or want to avoid Redis. Choose BullMQ for higher throughput and push-based delivery.

## Quick Setup

**Prerequisites:** See [pikku-project-setup](/skills/pikku-project-setup) for project structure detection and common setup patterns.

### 1. Install Packages

```bash
npm install @pikku/queue-pg-boss @pikku/core pg-boss
```

### 2. Create Worker File

**Standalone:** Create `src/start.ts` based on [templates/pg-boss/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/pg-boss/src/start.ts)

**Workspace:** Create worker file importing from functions package

**Key imports:**

- Import bootstrap from **queue subdirectory** (see [pikku-project-setup](/skills/pikku-project-setup) for queue bootstrap paths)
- Standalone: `./.pikku/queue/pikku-bootstrap-queue.gen.js`
- Workspace: `@my-app/functions/.pikku/queue/pikku-bootstrap-queue.gen.js`
- Import `PgBossQueueWorkers` from `@pikku/queue-pg-boss`
- Import config, services, and session factory

### 3. Configure PostgreSQL Connection

```typescript
const connectionString =
  process.env.DATABASE_URL ||
  'postgres://postgres:password@localhost:5432/pikku_queue'

const pgBossQueueWorkers = new PgBossQueueWorkers(
  connectionString,
  singletonServices,
  createSessionServices
)
```

**Critical:** Call `await init()` before `registerQueues()` to initialize PG-Boss and create database tables.

### 4. Setup Queue Service (for enqueuing)

Add `PgBossQueueService` to singleton services in your HTTP/channel handlers:

```typescript
import { PgBossQueueService } from '@pikku/queue-pg-boss'

const queue = new PgBossQueueService(process.env.DATABASE_URL)
```

### 5. Update Package.json Scripts

See [pikku-project-setup](/skills/pikku-project-setup) for complete script patterns. Queue workers use same scripts as Express/Fastify.

### 6. Generate & Verify

```bash
# Start PostgreSQL (Docker)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password -e POSTGRES_DB=pikku_queue postgres:16-alpine

# Generate wiring (if applicable to your project type)
npm run pikku

# Start worker
npm run dev

# Verify worker is processing (check logs and database)
```

**Expected outcome:** Worker starts, connects to PostgreSQL, creates PG-Boss tables on first run, registers queue processors, begins processing jobs. Jobs added via `queue.add()` are processed by workers.

---

## Installation

```bash
npm install @pikku/queue-pg-boss @pikku/core pg-boss
```

---

## Setup

### Standalone Project

For standalone projects where functions are in the same package.

**Example:** [templates/pg-boss/src/start.ts](https://github.com/vramework/pikku/blob/main/templates/pg-boss/src/start.ts)

**Pattern:**

```typescript
import { PgBossQueueWorkers } from '@pikku/queue-pg-boss'
import {
  createConfig,
  createSingletonServices,
  createSessionServices,
} from './services.js'
import './.pikku/queue/pikku-bootstrap-queue.gen.js'

async function main(): Promise<void> {
  const config = await createConfig()
  const singletonServices = await createSingletonServices(config)

  singletonServices.logger.info('Starting PG-Boss queue workers...')

  // Use DATABASE_URL environment variable or connection string
  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://postgres:password@localhost:5432/pikku_queue'

  const pgBossQueueWorkers = new PgBossQueueWorkers(
    connectionString,
    singletonServices,
    createSessionServices
  )

  // Initialize pg-boss (creates tables if needed)
  await pgBossQueueWorkers.init()

  // Register queue processors
  await pgBossQueueWorkers.registerQueues()

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    singletonServices.logger.info('Shutting down gracefully...')
    await pgBossQueueWorkers.close()
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    singletonServices.logger.info('Shutting down gracefully...')
    await pgBossQueueWorkers.close()
    process.exit(0)
  })
}

main()
```

**Key points:**

- Import bootstrap from `./.pikku/queue/pikku-bootstrap-queue.gen.js` (note `/queue/` directory)
- Create `PgBossQueueWorkers` with connection string, services, and session factory
- Call `await init()` to start pg-boss (creates database tables)
- Call `await registerQueues()` to start processing
- Handle SIGTERM/SIGINT for graceful shutdown

### Workspace Project

Backend imports functions from the functions package.

**Pattern:**

```typescript
import { PgBossQueueWorkers } from '@pikku/queue-pg-boss'
import {
  createConfig,
  createSingletonServices,
  createSessionServices,
} from '@my-app/functions/src/services'
import '@my-app/functions/.pikku/queue/pikku-bootstrap-queue.gen.js'

async function main(): Promise<void> {
  const config = await createConfig()
  const singletonServices = await createSingletonServices(config)

  const pgBossQueueWorkers = new PgBossQueueWorkers(
    process.env.DATABASE_URL!,
    singletonServices,
    createSessionServices
  )

  await pgBossQueueWorkers.init()
  await pgBossQueueWorkers.registerQueues()

  // ... graceful shutdown handlers ...
}

main()
```

**Key differences:**

- Import config/services from functions package
- Import bootstrap from functions: `@my-app/functions/.pikku/queue/pikku-bootstrap-queue.gen.js`
- No custom filtering support for queue workers

---

## PostgreSQL Configuration

PG-Boss requires PostgreSQL connection configuration.

**Connection string:**

```typescript
const connectionString = 'postgres://user:password@host:port/database'

const pgBossQueueWorkers = new PgBossQueueWorkers(
  connectionString,
  singletonServices,
  createSessionServices
)
```

**Connection options object:**

```typescript
import PgBoss from 'pg-boss'

const options: PgBoss.ConstructorOptions = {
  connectionString: process.env.DATABASE_URL,

  // Connection pool settings
  max: 20, // Max connections in pool

  // Application name for monitoring
  application_name: 'pikku-queue-worker',

  // Archival settings (automatic job cleanup)
  archiveCompletedAfterSeconds: 60 * 60 * 24, // Archive completed jobs after 1 day
  deleteAfterDays: 7, // Delete archived jobs after 7 days

  // Maintenance settings
  maintenanceIntervalMinutes: 15, // Run maintenance every 15 minutes
}

const pgBossQueueWorkers = new PgBossQueueWorkers(
  options,
  singletonServices,
  createSessionServices
)
```

**Database setup:**
PG-Boss automatically creates required tables on `init()`. No manual schema setup needed.

**Production tips:**

- Use connection pooling (adjust `max` based on workload)
- Configure archival to prevent database bloat
- Enable SSL for secure connections
- Set appropriate timeout values
- Monitor database size and query performance

---

## Queue Service (Enqueuing Jobs)

Use `PgBossQueueService` to add jobs to queues from your HTTP/channel handlers.

**Setup in services:**

```typescript
import { PgBossQueueService } from '@pikku/queue-pg-boss'
import type { QueueService } from '@pikku/core/queue'

export const createSingletonServices = async (config: Config) => {
  const queue: QueueService = new PgBossQueueService(process.env.DATABASE_URL)

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
})
```

**Job options:**

- `priority`: Job priority (lower number = higher priority)
- `delay`: Delay in milliseconds before processing
- `attempts`: Number of retry attempts
- `jobId`: Custom job ID for deduplication

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
    batchSize: 5, // Process 5 jobs in a batch
    pollInterval: 2000, // Poll every 2 seconds
  },
})
```

**Worker config options:**

| Option         | Description                | PG-Boss Mapping                                   |
| -------------- | -------------------------- | ------------------------------------------------- |
| `batchSize`    | Jobs to process in a batch | `batchSize`                                       |
| `pollInterval` | Polling interval (ms)      | `pollingIntervalSeconds` (converts ms to seconds) |

**Unsupported options (ignored):**

- `name`: PG-Boss identifies workers by queue name
- `autorun`: Always enabled in PG-Boss
- `lockDuration`: Managed by job-level expiration
- `drainDelay`: Handled internally
- `maxStalledCount`: Managed by retry mechanism
- `prefetch`: Managed internally
- `visibilityTimeout`: Uses PostgreSQL locks instead

**Fallback options (managed by PG-Boss):**

- `removeOnComplete`: Managed by archival system (see archiveCompletedAfterSeconds)
- `removeOnFail`: Managed by archival system

---

## Job Lifecycle

**Job states:**

1. **created**: Job added to queue
2. **active**: Job being processed
3. **completed**: Job finished successfully
4. **failed**: Job failed after all retries
5. **retry**: Job scheduled for retry
6. **expired**: Job exceeded time limit

**Job archival:**
PG-Boss automatically archives completed and failed jobs based on configuration:

- `archiveCompletedAfterSeconds`: Move completed jobs to archive table
- `deleteAfterDays`: Delete old archived jobs

**Job control:**

```typescript
// Fail job with custom error
throw new QueueJobFailedError('Invalid email format')

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

Run PostgreSQL locally:

```bash
# Docker
docker run -d -p 5432:5432 \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=pikku_queue \
  postgres:16-alpine

# Or use docker-compose
docker-compose up postgres
```

Start worker:

```bash
npm run dev
```

---

## Deployment

### Docker

PG-Boss workers can run in containers alongside your HTTP servers or as dedicated worker instances.

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

- Multiple workers automatically share jobs via PostgreSQL locks
- No coordination service needed
- Scale based on queue depth and job duration
- Monitor PostgreSQL connection pool usage

### Environment Variables

```bash
DATABASE_URL=postgres://user:password@host:5432/database
NODE_ENV=production
```

---

## Monitoring

### Database Queries

Monitor queue health with SQL queries:

```sql
-- Active jobs
SELECT * FROM pgboss.job WHERE state = 'active';

-- Failed jobs
SELECT * FROM pgboss.job WHERE state = 'failed';

-- Queue depth
SELECT name, COUNT(*) FROM pgboss.job
WHERE state = 'created'
GROUP BY name;

-- Archive size
SELECT COUNT(*) FROM pgboss.archive;
```

### Metrics

Monitor key metrics:

- Queue depth per queue
- Active jobs count
- Failed jobs count
- Average processing time
- Database connection pool usage
- Archive table size

**Note:** Unlike BullMQ, PG-Boss does not have a built-in web UI. Use database monitoring tools or build custom dashboards.

---

## Performance Tips

- **Batch size:** Use `batchSize` to process multiple jobs efficiently
- **Poll interval:** Balance between latency and database load
- **Connection pool:** Set `max` connections based on workers × batchSize
- **Archival:** Configure aggressive archival to prevent table bloat
- **Vacuum:** Run VACUUM ANALYZE regularly on job tables
- **Indexes:** PG-Boss creates appropriate indexes automatically
- **Job size:** Keep job data small (use references to large data)
- **Priorities:** Use sparingly (adds query overhead)

**Database maintenance:**

```sql
-- Vacuum job table
VACUUM ANALYZE pgboss.job;

-- Vacuum archive table
VACUUM ANALYZE pgboss.archive;
```

---

## Comparison: PG-Boss vs BullMQ

| Feature          | PG-Boss                    | BullMQ            |
| ---------------- | -------------------------- | ----------------- |
| Backing store    | PostgreSQL                 | Redis             |
| Delivery         | Polling                    | Push (pub/sub)    |
| Throughput       | Medium                     | High              |
| Durability       | ACID guarantees            | Redis persistence |
| Setup complexity | Simpler (one less service) | Requires Redis    |
| Job archival     | Automatic                  | Manual            |
| Monitoring       | SQL queries                | Bull Board UI     |

**Choose PG-Boss if:**

- Already using PostgreSQL
- Want simpler infrastructure (no Redis)
- Need ACID guarantees
- Prefer SQL-based monitoring

**Choose BullMQ if:**

- Need high throughput
- Want push-based delivery
- Prefer Redis
- Want built-in monitoring UI

---

## Examples

**Standalone:**

- [templates/pg-boss](https://github.com/vramework/pikku/tree/main/templates/pg-boss) - PG-Boss worker

---

## Critical Rules

### Standalone Projects

- [ ] Import bootstrap from: `./.pikku/queue/pikku-bootstrap-queue.gen.js` (note `/queue/` directory)
- [ ] Import services from local files
- [ ] Create `PgBossQueueWorkers` with connection string, singleton services, and session factory
- [ ] Call `await init()` before `registerQueues()` to initialize PG-Boss
- [ ] Call `await registerQueues()` to start processing
- [ ] Handle SIGTERM/SIGINT for graceful shutdown

### Workspace Projects

- [ ] Import config/services from functions: `@my-app/functions/src/...`
- [ ] Import bootstrap from functions: `@my-app/functions/.pikku/queue/pikku-bootstrap-queue.gen.js`
- [ ] Backend package.json has `"@my-app/functions": "workspace:*"`

### PostgreSQL Configuration

- [ ] Set DATABASE_URL environment variable
- [ ] Configure connection pool size appropriately
- [ ] Enable SSL for production
- [ ] Configure archival settings to prevent bloat
- [ ] Set maintenance interval for cleanup

### Service Integration

- [ ] Add `PgBossQueueService` to singleton services for enqueuing jobs
- [ ] Use same database for both workers and service
- [ ] Configure job options (priority, delay, attempts) appropriately

### Worker Configuration

- [ ] Set appropriate `batchSize` for throughput
- [ ] Configure `pollInterval` to balance latency and database load
- [ ] Understand which options are unsupported/fallback

### Database Maintenance

- [ ] Monitor job and archive table sizes
- [ ] Run VACUUM ANALYZE regularly
- [ ] Configure aggressive archival for high-volume queues
- [ ] Monitor connection pool usage

### Development

- [ ] Run PostgreSQL locally (Docker recommended)
- [ ] Use `tsx --watch` for development
- [ ] Monitor queue depth and processing rate
- [ ] Test failure scenarios and retries

### Deployment

- [ ] Use environment variables for database config
- [ ] Scale workers horizontally as needed
- [ ] Monitor queue metrics via SQL queries
- [ ] Configure graceful shutdown
- [ ] Monitor database performance

### Performance

- [ ] Keep job data small (use references)
- [ ] Use priorities sparingly
- [ ] Optimize `batchSize` and `pollInterval`
- [ ] Run database vacuum regularly
- [ ] Monitor and optimize database connections

---

## Related Skills

**Prerequisites:**

- [pikku-project-setup](/skills/pikku-project-setup) - Project structure and common setup patterns
- [pikku-functions](/skills/pikku-functions) - Creating Pikku function definitions

**Wiring:**

- [pikku-queue](/skills/pikku-queue) - Queue function definitions and enqueue patterns

**Alternative Queue Runtimes:**

- [pikku-queue-bullmq](/skills/pikku-queue-bullmq) - Redis-based queue alternative (higher throughput)
