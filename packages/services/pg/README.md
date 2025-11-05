# @pikku-workflows/pg

PostgreSQL-based implementation of WorkflowStateService for Pikku Workflows.

## Features

- **PgWorkflowStateService**: PostgreSQL implementation of WorkflowStateService for persistent workflow execution state
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

### Basic Setup

```typescript
import postgres from 'postgres'
import { PgWorkflowStateService } from '@pikku-workflows/pg'

// Create postgres connection
const sql = postgres({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'postgres',
  password: 'password',
})

// Create workflow state service
const workflowState = new PgWorkflowStateService(sql, queueService, 'workflows')

// Initialize (creates schema and tables)
await workflowState.init()
```

### Custom Schema Name

```typescript
// Use a custom schema name
const workflowState = new PgWorkflowStateService(sql, queueService, 'my_app_workflows')
await workflowState.init() // Creates 'my_app_workflows' schema
```

### With Existing Connection

```typescript
// Share connection with other services
const sql = postgres(process.env.DATABASE_URL!)
const workflowState = new PgWorkflowStateService(sql, queueService)
// Connection is shared, won't be closed by workflowState.close()
```

### With Config (Owned Connection)

```typescript
// Let service create its own connection
const workflowState = new PgWorkflowStateService(
  { host, database, user, password },
  queueService
)
await workflowState.init()
// Later...
await workflowState.close() // Closes the connection
```

## Database Schema

The service automatically creates the following tables:

```sql
CREATE SCHEMA IF NOT EXISTS {schema_name};

CREATE TABLE IF NOT EXISTS {schema_name}.workflow_runs (
  id TEXT PRIMARY KEY,
  workflow TEXT NOT NULL,
  status TEXT NOT NULL,
  input JSONB NOT NULL,
  output JSONB,
  error JSONB,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS {schema_name}.workflow_steps (
  run_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL,
  result JSONB,
  error JSONB,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (run_id, step_name),
  FOREIGN KEY (run_id) REFERENCES {schema_name}.workflow_runs(id) ON DELETE CASCADE
);
```

## API

### PgWorkflowStateService

Extends `WorkflowStateService` from `@pikku-workflows/core`.

#### Constructor

```typescript
new PgWorkflowStateService(
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
- `updateRunStatus(id, status, output?, error?)`: Update run status
- `getStepState(runId, stepName)`: Get step state
- `setStepScheduled(runId, stepName)`: Mark step as scheduled
- `setStepResult(runId, stepName, result)`: Store step result
- `setStepError(runId, stepName, error)`: Store step error
- `withRunLock(id, fn)`: Execute function with run lock
- `close()`: Close database connection (if owned)

## License

MIT
