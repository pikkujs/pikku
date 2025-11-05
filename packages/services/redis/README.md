# @pikku-workflows/redis

Redis-based implementation of WorkflowStateService for Pikku Workflows.

## Features

- **RedisWorkflowStateService**: Redis implementation of WorkflowStateService for persistent workflow execution state
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

### Basic Setup

```typescript
import Redis from 'ioredis'
import { RedisWorkflowStateService } from '@pikku-workflows/redis'

// Create Redis connection
const redis = new Redis({
  host: 'localhost',
  port: 6379,
})

// Create workflow state service
const workflowState = new RedisWorkflowStateService(redis, queueService, 'workflows')

// Initialize (verifies connection)
await workflowState.init()
```

### Custom Key Prefix

```typescript
// Use a custom key prefix
const workflowState = new RedisWorkflowStateService(redis, queueService, 'myapp_workflows')
await workflowState.init()
```

### With Connection String

```typescript
// Create service with Redis connection string
const workflowState = new RedisWorkflowStateService(
  'redis://localhost:6379',
  queueService
)
await workflowState.init()
```

### With Existing Connection

```typescript
// Share connection with other services
const redis = new Redis('redis://localhost:6379')
const workflowState = new RedisWorkflowStateService(redis, queueService)
// Connection is shared, won't be closed by workflowState.close()
```

### With Config (Owned Connection)

```typescript
// Let service create its own connection
const workflowState = new RedisWorkflowStateService(
  { host, port, password },
  queueService
)
await workflowState.init()
// Later...
await workflowState.close() // Closes the connection
```

## Redis Data Structure

The service uses the following Redis data structures:

### Workflow Runs
- **Hash**: `{keyPrefix}:run:{runId}` - Stores workflow run data
  - `id`: Run ID
  - `workflow`: Workflow name
  - `status`: Current status ('running', 'completed', 'failed')
  - `input`: JSON string of input data
  - `output`: JSON string of output data (if completed)
  - `error`: JSON string of error (if failed)
  - `createdAt`: Timestamp
  - `updatedAt`: Timestamp

### Workflow Steps
- **Hash**: `{keyPrefix}:step:{runId}:{stepName}` - Stores step execution data
  - `status`: Step status ('pending', 'scheduled', 'done', 'error')
  - `result`: JSON string of result (if done)
  - `error`: JSON string of error (if error)
  - `updatedAt`: Timestamp

### Locking
- **String**: `{keyPrefix}:lock:{runId}` - Distributed lock with TTL (30 seconds)

## API

### RedisWorkflowStateService

Extends `WorkflowStateService` from `@pikku/core/workflow`.

#### Constructor

```typescript
new RedisWorkflowStateService(
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
- `updateRunStatus(id, status, output?, error?)`: Update run status
- `getStepState(runId, stepName)`: Get step state
- `setStepScheduled(runId, stepName)`: Mark step as scheduled
- `setStepResult(runId, stepName, result)`: Store step result
- `setStepError(runId, stepName, error)`: Store step error
- `withRunLock(id, fn)`: Execute function with distributed lock
- `close()`: Close Redis connection (if owned)

## Locking Behavior

The `withRunLock` method uses Redis SET NX with a 30-second TTL for distributed locking:

- Retries up to 10 times with 100ms delay between attempts
- Automatically releases lock after function execution
- Uses Lua script to ensure only the lock owner can release it
- Lock automatically expires after 30 seconds if not released

## License

MIT
