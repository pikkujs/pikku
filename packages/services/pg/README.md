# @pikku-workflows/pg

PostgreSQL-based implementation of WorkflowStateService for Pikku Workflows.

## Features

- **PgWorkflowService**: PostgreSQL implementation of WorkflowStateService for persistent workflow execution state
- **Auto-initialization**: Automatically creates required schema and tables on startup
- **Configurable schema**: Use custom schema names (default: 'workflows')
- **Row-level locking**: Uses PostgreSQL advisory locks for concurrent run safety
- **Type-safe**: Full TypeScript support

## Installation

```bash
npm install @pikku-workflows/pg postgres
# or
yarn add @pikku-workflows/pg postgres
```

## Usage

### Basic Setup (Remote Mode)

```typescript
import postgres from 'postgres'
import { PgWorkflowService } from '@pikku-workflows/pg'
import { PgBossQueueService } from '@pikku/queue-pg-boss'

// Create postgres connection
const sql = postgres({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'postgres',
  password: 'password',
})

// Create queue service for remote mode
const queueService = new PgBossQueueService('postgresql://localhost:5432/mydb')

// Create workflow state service
const workflowService = new PgWorkflowService(sql, queueService, 'workflows')

// Initialize (creates schema and tables)
await workflowService.init()
```

### Inline Mode Setup (Testing)

For testing, pass `undefined` as the queue service to enable inline mode:

```typescript
// Create workflow state service without queue = inline mode
const workflowService = new PgWorkflowService(
  sql,
  undefined, // No queue service = inline mode
  'workflows'
)

await workflowService.init()
```

### Custom Schema Name

```typescript
// Use a custom schema name
const workflowService = new PgWorkflowService(
  sql,
  queueService,
  'my_app_workflows'
)
await workflowService.init() // Creates 'my_app_workflows' schema
```

### With Existing Connection

```typescript
// Share connection with other services
const sql = postgres(process.env.DATABASE_URL!)
const workflowService = new PgWorkflowService(sql, queueService)
// Connection is shared, won't be closed by workflowService.close()
```

### With Config (Owned Connection)

```typescript
// Let service create its own connection
const workflowService = new PgWorkflowService(
  { host, database, user, password },
  queueService
)
await workflowService.init()
// Later...
await workflowService.close() // Closes the connection
```

## Database Schema

The service automatically creates the following tables:

```sql
CREATE SCHEMA IF NOT EXISTS {schema_name};

CREATE TABLE IF NOT EXISTS {schema_name}.workflow_runs (
  id TEXT PRIMARY KEY,
  workflow TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'running' | 'completed' | 'failed' | 'cancelled'
  input JSONB NOT NULL,
  output JSONB,
  error JSONB,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS {schema_name}.workflow_step (
  step_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'pending' | 'scheduled' | 'succeeded' | 'failed'
  rpc_name TEXT,
  data JSONB,
  result JSONB,
  error JSONB,
  retries INTEGER,
  retry_delay TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES {schema_name}.workflow_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workflow_step_run_step
  ON {schema_name}.workflow_step(run_id, step_name);

CREATE TABLE IF NOT EXISTS {schema_name}.workflow_step_history (
  step_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL,
  result JSONB,
  error JSONB,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (step_id),
  FOREIGN KEY (run_id) REFERENCES {schema_name}.workflow_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workflow_step_history_run
  ON {schema_name}.workflow_step_history(run_id, created_at);
```

## API

### PgWorkflowService

Extends `WorkflowStateService` from `@pikku-workflows/core`.

#### Constructor

```typescript
new PgWorkflowService(
  connectionOrConfig: postgres.Sql | postgres.Options<{}>,
  queue?: any,
  schemaName?: string
)
```

- `connectionOrConfig`: postgres.Sql connection instance or postgres.Options config
- `queue`: Optional queue service for remote workflow execution
- `schemaName`: PostgreSQL schema name (default: 'workflows')

#### Methods

- `init()`: Initialize the service (creates schema and tables)
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
- `withRunLock(id, fn)`: Execute function with run lock
- `close()`: Close database connection (if owned)

## Documentation

For complete workflow documentation, see [pikku.dev/docs/workflows](https://pikku.dev/docs/workflows)

## License

MIT
