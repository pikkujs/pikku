# @pikku-workflows/redis

Redis-based implementation of WorkflowStateService for Pikku Workflows.

## Features

- **RedisWorkflowService**: Redis implementation of WorkflowStateService for persistent workflow execution state
- **Fast in-memory storage**: Leverage Redis for high-performance workflow state management
- **Configurable key prefix**: Use custom key prefixes for namespace isolation (default: 'workflows')
- **Distributed locking**: Uses Redis SET NX with TTL for concurrent run safety
- **Type-safe**: Full TypeScript support

## Installation

```bash
npm install @pikku-workflows/redis ioredis
# or
yarn add @pikku-workflows/redis ioredis
```

## Usage

### Basic Setup (Remote Mode)

```typescript
import Redis from 'ioredis'
import { RedisWorkflowService } from '@pikku-workflows/redis'
import { BullQueueService } from '@pikku/queue-bullmq'

// Create Redis connection
const redis = new Redis({
  host: 'localhost',
  port: 6379,
})

// Create queue service for remote mode
const queueService = new BullQueueService('redis://localhost:6379')

// Create workflow state service
const workflowService = new RedisWorkflowService(
  redis,
  queueService,
  'workflows'
)

// Initialize (verifies connection)
await workflowService.init()
```

### Inline Mode Setup (Testing)

For testing, pass `undefined` as the queue service to enable inline mode:

```typescript
// Create workflow state service without queue = inline mode
const workflowService = new RedisWorkflowService(
  redis,
  undefined, // No queue service = inline mode
  'workflows'
)

await workflowService.init()
```

### Custom Key Prefix

```typescript
// Use a custom key prefix
const workflowService = new RedisWorkflowService(
  redis,
  queueService,
  'myapp_workflows'
)
await workflowService.init()
```

### With Connection String

```typescript
// Create service with Redis connection string
const workflowService = new RedisWorkflowService(
  'redis://localhost:6379',
  queueService
)
await workflowService.init()
```

### With Existing Connection

```typescript
// Share connection with other services
const redis = new Redis('redis://localhost:6379')
const workflowService = new RedisWorkflowService(redis, queueService)
// Connection is shared, won't be closed by workflowService.close()
```

### With Config (Owned Connection)

```typescript
// Let service create its own connection
const workflowService = new RedisWorkflowService(
  { host, port, password },
  queueService
)
await workflowService.init()
// Later...
await workflowService.close() // Closes the connection
```

## Redis Data Structure

The service uses the following Redis data structures:

### Workflow Runs

- **Hash**: `{keyPrefix}:run:{runId}` - Stores workflow run data
  - `id`: Run ID
  - `workflow`: Workflow name
  - `status`: Current status ('running', 'completed', 'failed', 'cancelled')
  - `input`: JSON string of input data
  - `output`: JSON string of output data (if completed)
  - `error`: JSON string of error (if failed)
  - `createdAt`: Timestamp
  - `updatedAt`: Timestamp

### Workflow Steps

- **Hash**: `{keyPrefix}:step:{runId}:{stepName}` - Stores step execution data
  - `stepId`: Unique step ID
  - `status`: Step status ('pending', 'scheduled', 'succeeded', 'failed')
  - `rpcName`: RPC function name (if RPC step)
  - `data`: JSON string of step input data
  - `result`: JSON string of result (if succeeded)
  - `error`: JSON string of error (if failed)
  - `retries`: Number of retry attempts allowed
  - `retryDelay`: Delay between retries
  - `attemptCount`: Current attempt number
  - `createdAt`: Timestamp
  - `updatedAt`: Timestamp

### Workflow Step History

- **List**: `{keyPrefix}:history:{runId}` - Stores all step attempts in chronological order
  - Each entry contains complete step state for that attempt

### Locking

- **String**: `{keyPrefix}:lock:{runId}` - Distributed lock with TTL (30 seconds)

## API

### RedisWorkflowService

Extends `WorkflowStateService` from `@pikku/core/workflow`.

#### Constructor

```typescript
new RedisWorkflowService(
  connectionOrConfig: Redis | RedisOptions | string,
  queue?: any,
  keyPrefix?: string
)
```

- `connectionOrConfig`: ioredis Redis instance, RedisOptions config, or connection string
- `queue`: Optional queue service for remote workflow execution
- `keyPrefix`: Redis key prefix (default: 'workflows')

#### Methods

- `init()`: Initialize the service (verifies Redis connection)
- `createRun(workflowName, input)`: Create a new workflow run
- `getRun(id)`: Get workflow run by ID
- `getRunHistory(runId)`: Get all step attempts in chronological order
- `updateRunStatus(id, status, output?, error?)`: Update run status
- `insertStepState(runId, stepName, rpcName, data, stepOptions?)`: Insert initial step state
- `getStepState(runId, stepName)`: Get step state with attempt count
- `setStepScheduled(stepId)`: Mark step as scheduled
- `setStepRunning(stepId)`: Mark step as running
- `setStepResult(stepId, result)`: Store step result and mark as succeeded
- `setStepError(stepId, error)`: Store step error and mark as failed
- `createRetryAttempt(failedStepId)`: Create a new retry attempt for a failed step
- `withRunLock(id, fn)`: Execute function with distributed lock
- `close()`: Close Redis connection (if owned)

## Documentation

For complete workflow documentation, see [pikku.dev/docs/workflows](https://pikku.dev/docs/workflows)

## Locking Behavior

The `withRunLock` method uses Redis SET NX with a 30-second TTL for distributed locking:

- Retries up to 10 times with 100ms delay between attempts
- Automatically releases lock after function execution
- Uses Lua script to ensure only the lock owner can release it
- Lock automatically expires after 30 seconds if not released

## License

MIT
