# Pikku Workflows - Architectural Proposal

## Overview

Add first-class workflow support to Pikku following existing patterns for `wireHttp`, `wireChannel`, `wireQueueWorker`, and `wireScheduler`. Workflows orchestrate multi-step processes with explicit step caching, configurable execution (inline/remote workflow modes), and pluggable state persistence.

**Key API:** `workflow.do()` has two forms:

- **RPC form**: `workflow.do(stepName, rpcName, data, options?)` - generates queue worker for isolated execution with retries
- **Inline form**: `workflow.do(stepName, async () => {...}, options?)` - executes locally in orchestrator, cached for replay

Both forms cache results for deterministic replay after failures.

---

## Core Concepts

### Step Caching

Every `workflow.do()` call is cached by its `stepName` (first argument). On replay after failure, cached steps return their stored results without re-execution.

### Three Ways to Execute RPCs

| Method                     | Cached? | Tracked? | Queue Worker? | Use Case                           |
| -------------------------- | ------- | -------- | ------------- | ---------------------------------- |
| `rpc.invoke()`             | ❌      | ❌       | ❌            | Quick reads, idempotent lookups    |
| `workflow.do(RPC form)`    | ✅      | ✅       | ✅            | External APIs, long operations     |
| `workflow.do(Inline form)` | ✅      | ✅       | ❌            | Fast calculations, transformations |

### Execution Modes

**Workflow-level execution mode** (`wireWorkflow.executionMode`):

- `'remote'` (default): Workflow runs as queue-based orchestrator with full durability
- `'inline'`: Workflow runs synchronously via direct `rpc.invoke()` (testing/development only)

**Step-level execution** (determined by `workflow.do()` form):

- **RPC form**: Always generates queue worker (even in inline workflow mode)
- **Inline form**: Always executes in orchestrator (even in remote workflow mode)

---

## Package Breakdown

### 1. **@pikku/core** - Core workflow primitive

**New files:**

```
/src/wirings/workflow/
├── workflow.types.ts         # Type definitions
├── workflow-runner.ts         # Registration & execution
├── workflow-state.types.ts    # Abstract state service
└── index.ts                   # Public exports
```

**Key types:**

```typescript
// workflow.types.ts
export type CoreWorkflow<I = any, O = any> = {
  name: string
  description?: string
  executionMode?: 'inline' | 'remote' // default: 'remote'
  func: PikkuFunctionConfig<I, O>
  middleware?: PikkuMiddleware[]
  permissions?: PikkuPermission[]
  tags?: string[]
  docs?: PikkuFunctionDocs
}

export type WorkflowMeta = {
  name: string
  description?: string
  executionMode: 'inline' | 'remote'
  steps: WorkflowStepMeta[]
  tags?: string[]
}

export type WorkflowStepMeta =
  | {
      type: 'rpc' // RPC form - generates queue worker
      stepName: string | '<dynamic>' // Cache key
      rpcName: string | '<dynamic>' // RPC to invoke
      description?: string | '<dynamic>' // Display name
      options?: WorkflowStepOptions
    }
  | {
      type: 'inline' // Inline form - local execution
      stepName: string | '<dynamic>' // Cache key
      description?: string | '<dynamic>' // Display name
      options?: WorkflowStepOptions
    }
  | {
      type: 'sleep' // Phase 2
      duration: string | number | '<dynamic>'
      description?: string | '<dynamic>'
      options?: WorkflowStepOptions
    }

export type WorkflowStepOptions = {
  description?: string // Display name (optional)
  // Future: retries, timeout, failFast, priority
}

export type PikkuWorkflowInteraction = {
  // RPC form - generates queue worker
  do<R extends keyof RpcMap>(
    stepName: string, // Cache key
    rpcName: R, // RPC to invoke
    data: RpcMap[R]['input'],
    options?: WorkflowStepOptions
  ): Promise<RpcMap[R]['output']>

  // Inline form - executes locally, cached
  do<T>(
    stepName: string, // Cache key
    fn: () => Promise<T> | T, // Inline function
    options?: WorkflowStepOptions
  ): Promise<T>

  sleep(duration: string | number, options?: WorkflowStepOptions): void
}

export type PikkuWorkflow = {
  start: <I>(input: I) => Promise<{ runId: string }>
  getRun: (runId: string) => Promise<WorkflowRun>
  cancelRun: (runId: string) => Promise<void>
}
```

**workflow-runner.ts:**

```typescript
export function wireWorkflow(config: CoreWorkflow): void
export function getWorkflows(): Map<string, CoreWorkflow>
export function startWorkflow<I>(
  name: string,
  input: I
): Promise<{ runId: string }>
export function runWorkflowJob(runId: string): Promise<void>
```

**workflow-state.types.ts:**

```typescript
export abstract class WorkflowStateService {
  abstract createRun(meta: WorkflowMeta, input: any): Promise<string>
  abstract getRun(id: string): Promise<WorkflowRun>
  abstract updateRunStatus(id: string, status: WorkflowStatus): Promise<void>

  abstract getStepState(runId: string, stepName: string): Promise<StepState>
  abstract setStepScheduled(runId: string, stepName: string): Promise<void>
  abstract setStepResult(
    runId: string,
    stepName: string,
    result: any
  ): Promise<void>
  abstract setStepError(
    runId: string,
    stepName: string,
    error: Error
  ): Promise<void>

  abstract withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T>
}

export type WorkflowRun = {
  id: string
  workflow: string
  status: 'running' | 'completed' | 'failed'
  meta: WorkflowMeta
  input: any
  output?: any
  error?: SerializedError
  createdAt: number
  updatedAt: number
}

export type StepState = {
  status: 'pending' | 'scheduled' | 'done' | 'error'
  result?: any
  error?: SerializedError
  updatedAt: number
}

export type WorkflowStatus = 'running' | 'completed' | 'failed'

export type SerializedError = {
  message: string
  stack?: string
  code?: string
}
```

**Update pikku-state.ts:**

```typescript
workflows: {
  registrations: Map<string, CoreWorkflow>
  meta: WorkflowsMeta
}
```

---

### 2. **@pikku/inspector** - AST discovery

**New file:**

```
/src/add/add-workflow.ts
```

**Responsibilities:**

- Detect `wireWorkflow()` calls
- Parse `workflow.do()` calls and differentiate forms by 2nd argument type:
  - **String literal** → RPC form → `{ type: 'rpc', ... }`
  - **Function expression** → Inline form → `{ type: 'inline', ... }`
  - **Variable reference** → Attempt type inference, mark `'<dynamic>'` if unclear
- Extract metadata:
  - Literal stepName → extract value
  - Literal rpcName (RPC form only) → extract value
  - Literal description in options → extract value
  - Mark dynamic values as `'<dynamic>'`
- Emit warnings:
  - Dynamic stepName without description
- Build flat list of discovered steps
- Store in `InspectorState.workflows`

**Detection Logic:**

| Code                                         | 2nd Arg Type   | Detected As           | Queue Worker?     |
| -------------------------------------------- | -------------- | --------------------- | ----------------- |
| `workflow.do('step', 'rpc.name', data)`      | String literal | RPC form              | ✅ Yes            |
| `workflow.do('step', async () => {...})`     | Function       | Inline form           | ❌ No             |
| `workflow.do('step', () => rpc.invoke(...))` | Function       | Inline form           | ❌ No             |
| `workflow.do('step', rpcName, data)`         | Variable       | Try infer, likely RPC | ✅ If string type |
| `rpc.invoke('rpc.name', data)`               | N/A            | Not a step            | ❌ No             |

**Example Metadata:**

```typescript
// From code:
await workflow.do('createUser', 'users.create', data)
await workflow.do('calcTax', () => data.amount * 0.08)

// Inspector output:
{
  name: 'onboarding',
  executionMode: 'remote',
  steps: [
    { type: 'rpc', stepName: 'createUser', rpcName: 'users.create' },
    { type: 'inline', stepName: 'calcTax' }
  ]
}
```

**Inspector Warnings:**

```
⚠️  Dynamic step name at src/workflows/onboarding.workflow.ts:23:19

    await workflow.do(step, 'users.create', data)
                      ^^^^

    Step names are dynamic and will not appear in generated documentation.
    Consider adding a description for better observability:

    await workflow.do(step, 'users.create', data, {
      description: 'Create user account'
    })
```

---

### 3. **@pikku/cli** - Code generation

**New files:**

```
/src/functions/wirings/workflow/
├── pikku-command-workflow.ts       # CLI command
├── serialize-workflow-meta.ts      # Generate metadata JSON
└── serialize-workflow-types.ts     # Generate TypeScript types
```

**Generated files:**

```
.pikku/
├── pikku-workflow-wirings.gen.ts       # Runtime wiring imports
├── pikku-workflow-wirings-meta.gen.ts  # Metadata for inspector
└── pikku-workflow-map.gen.ts           # Type-safe workflow map
```

**Codegen output per workflow:**

1. **Entry function** (both forms):

```typescript
// Generated in pikku-workflow-wirings.gen.ts
export async function start_onboarding(input: OnboardingInput) {
  return startWorkflow('onboarding', input)
}
```

2. **Queue workers** (RPC form only):

```typescript
// Generated ONLY for RPC form steps
// For: workflow.do('createUser', 'users.create', data)

wireQueueWorker({
  queueName: 'workflow-onboarding-createUser',
  func: pikkuFunc(async ({ rpc, workflowState, queue }, payload) => {
    const { runId, stepName, rpcName, data } = payload

    // Idempotency check
    const step = await workflowState.getStepState(runId, stepName)
    if (step.status === 'done') return

    // Execute RPC
    const result = await rpc.invoke(rpcName, data)
    await workflowState.setStepResult(runId, stepName, result)

    // Trigger orchestrator
    await queue.add('workflow-onboarding-orchestrator', { runId })
  }),
})

// Inline form steps do NOT generate queue workers
// They execute directly in the orchestrator
```

3. **Orchestrator queue** (handles both forms):

```typescript
wireQueueWorker({
  queueName: 'workflow-onboarding-orchestrator',
  func: pikkuFunc(async ({ workflowState, queue }, { runId }) => {
    await runWorkflowJob(runId) // Replays workflow function
  }),
})
```

4. **Type-safe client API**:

```typescript
// pikku-workflow-map.gen.ts
export const workflows = {
  onboarding: {
    start: (input: OnboardingInput) => start_onboarding(input),
    getRun: (runId: string) => workflowState.getRun(runId),
  },
}
```

---

### 4. **@pikku/services-workflow-sqlite** - Default state implementation

**New package:**

```
/packages/services/workflow-sqlite/
├── workflow-state-sqlite.ts
└── schema.sql
```

**SQLite schema:**

```sql
CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_name TEXT NOT NULL,
  status TEXT NOT NULL,
  input_json TEXT,
  output_json TEXT,
  error_json TEXT,
  meta_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE workflow_steps (
  run_id TEXT NOT NULL,
  step_name TEXT NOT NULL,              -- Cache key (stepName from workflow.do)
  rpc_name TEXT,                        -- Actual RPC invoked (RPC form only)
  description TEXT,                     -- Display name (from options or stepName)
  status TEXT NOT NULL,
  result_json TEXT,
  error_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, step_name),
  FOREIGN KEY (run_id) REFERENCES workflow_runs(id)
);

CREATE INDEX idx_workflow_steps_status ON workflow_steps(run_id, status);
CREATE INDEX idx_workflow_runs_status ON workflow_runs(workflow_name, status);
```

---

### 5. **@pikku/services-workflow-memory** - In-memory state (for tests)

**New package:**

```
/packages/services/workflow-memory/
└── workflow-state-memory.ts
```

Simple `Map`-based implementation for unit tests.

---

### 6. **Documentation & Skills**

**New skill:**

```
/website/docs/skills/pikku-workflow/
├── SKILL.md
└── examples/
    ├── onboarding.workflow.ts
    ├── order-fulfillment.workflow.ts
    └── patterns.workflow.ts
```

**Documentation:**

```
/website/docs/core-concepts/
└── workflows.md
```

---

## API Design

### Author API

```typescript
// onboarding.workflow.ts
import { wireWorkflow } from './.pikku/pikku-types.gen.js'

export const onboarding = pikkuFunc<OnboardingInput, OnboardingOutput>(
  async ({ workflow, rpc, logger }, data) => {
    // RPC form - generates dedicated queue worker
    const user = await workflow.do(
      'createUser',
      'users.create',
      {
        email: data.email,
      },
      {
        description: 'Create new user account',
      }
    )

    // Inline form - fast calculation, cached result
    const taxRate = await workflow.do(
      'calculateTaxRate',
      () => {
        return user.region === 'EU' ? 0.2 : 0.08
      },
      {
        description: 'Calculate regional tax rate',
      }
    )

    // RPC form - external API needs retries
    await workflow.do(
      'validateEmail',
      'email.sendVerification',
      { email: user.email },
      { description: 'Send email verification link' }
    )

    // Branching happens naturally
    if (user.isPremium) {
      // RPC form - queued execution
      await workflow.do(
        'setupPremium',
        'premium.setup',
        {
          userId: user.id,
        },
        {
          description: 'Configure premium features and benefits',
        }
      )
    } else {
      // Inline form - simple flag update
      await workflow.do(
        'setupStandard',
        async () => {
          return { tier: 'standard', features: ['basic'] }
        },
        {
          description: 'Set standard account features',
        }
      )
    }

    // Inline form wrapping RPC - cached but local
    const notificationResult = await workflow.do(
      'sendWelcome',
      async () => {
        return await rpc.invoke('notify.sms', {
          userId: user.id,
          text: 'Welcome!',
        })
      },
      {
        description: 'Send welcome SMS notification',
      }
    )

    // Bare rpc.invoke - not cached, re-runs on replay
    const settings = await rpc.invoke('settings.getDefaults', {})

    return {
      userId: user.id,
      status: 'completed',
      taxRate,
      settings, // fetched fresh on every replay
    }
  }
)

wireWorkflow({
  name: 'onboarding',
  description: 'Onboards a new user with email verification',
  executionMode: 'remote', // 'inline' | 'remote' (default: 'remote')
  func: onboarding,
  middleware: [auditMiddleware],
  tags: ['onboarding', 'users'],
  docs: {
    summary: 'User onboarding workflow',
    description: 'Creates user, verifies email, sets up account tier',
    tags: ['workflows', 'onboarding'],
  },
})
```

### Runtime Execution

**Remote mode (queue-based):**

```typescript
// Start workflow
const { runId } = await workflows.onboarding.start({
  email: 'user@example.com',
})

// Check status
const run = await workflows.onboarding.getRun(runId)
console.log(run.status) // 'running' | 'completed' | 'failed'
```

**Inline mode (direct invocation):**

```typescript
// Executes synchronously via rpc.invoke()
const result = await workflows.onboarding.start({ email: 'user@example.com' })
console.log(result) // { userId: '123', status: 'completed', ... }
```

---

## Three Ways to Execute RPCs in Workflows

### 1. Bare `rpc.invoke()` - Not Tracked

```typescript
const settings = await rpc.invoke('settings.get', {})
```

**Behavior:**

- ❌ Not cached
- ❌ Not tracked as workflow step
- ❌ No step-level retries
- ❌ Re-executes on every replay
- ✅ Use for: Quick reads, idempotent lookups you don't need to cache

### 2. RPC Form - Queued Execution

```typescript
const user = await workflow.do('createUser', 'users.create', data)
```

**Behavior:**

- ✅ Cached for replay
- ✅ Tracked as step in workflow
- ✅ Generates dedicated queue worker
- ✅ Step-level retry configuration
- ✅ Full observability
- ✅ Use for: External APIs, long operations, things that fail

**Execution Flow:**

1. Orchestrator checks cache
2. If not done: schedule queue job, throw `WorkflowAsyncException`
3. Queue worker executes RPC in isolation
4. Result cached
5. Orchestrator replays, returns cached result

### 3. Inline Form - Local Execution, Cached

```typescript
const user = await workflow.do('createUser', async () => {
  return await rpc.invoke('users.create', data)
})
```

**Behavior:**

- ✅ Cached for replay
- ✅ Tracked as step in workflow
- ❌ No dedicated queue worker (runs in orchestrator)
- ❌ Retry = retry whole orchestrator
- ✅ Use for: Fast operations you want cached, transformations

**Execution Flow:**

1. Orchestrator checks cache
2. If not done: execute function inline, cache result
3. On replay: return cached result (skip execution)

### Comparison Table

| Aspect       | Bare rpc.invoke() | workflow.do(RPC form) | workflow.do(Inline form) |
| ------------ | ----------------- | --------------------- | ------------------------ |
| Cached       | ❌ No             | ✅ Yes                | ✅ Yes                   |
| Tracked      | ❌ No             | ✅ Yes                | ✅ Yes                   |
| Queue Worker | ❌ No             | ✅ Yes                | ❌ No                    |
| Isolation    | N/A               | ✅ Separate process   | ❌ Orchestrator          |
| Retries      | ❌ No             | ✅ Step-level         | ⚠️ Orchestrator-level    |
| Best For     | Fast reads        | External APIs         | Calculations             |

---

## Execution Flow (Remote Mode)

1. **Start:** `workflows.onboarding.start(input)`

   - Creates run in `WorkflowStateService`
   - Enqueues `workflow-onboarding-orchestrator` job

2. **Orchestrator job:**

   - Calls `runWorkflowJob(runId)`
   - Replays workflow function from the beginning
   - For each `workflow.do()`:
     - Check step state by stepName (cache key)
     - **If RPC form** (`workflow.do(stepName, rpcName, data)`):
       - If `pending`: schedule queue job, mark `scheduled`, throw `WorkflowAsyncException`
       - If `done`: return cached result
     - **If Inline form** (`workflow.do(stepName, fn)`):
       - If `pending`: execute fn(), cache result, return result
       - If `done`: return cached result (skip fn)
   - For bare `rpc.invoke()`:
     - Execute immediately (not cached)
   - When function completes: mark workflow `completed`

3. **Step job** (RPC form only):

   - Executes in dedicated queue worker
   - Invokes actual RPC
   - Stores result in `WorkflowStateService`
   - Triggers orchestrator to continue

4. **Repeat** until workflow completes or fails

---

## Step Execution Semantics

### Cache Key Resolution

Both forms use `stepName` (first argument) as cache key:

```typescript
await workflow.do('createUser', ...)
                 ^^^^^^^^^^^^ Cache key
```

Optional `description` is display-only metadata:

```typescript
await workflow.do('createUser', ..., {
  description: 'Create new user account'
  ^^^^^^^^^^^^^^ Display in logs/UI, doesn't affect execution
})
```

### RPC Form Execution

**First execution:**

```typescript
const user = await workflow.do('createUser', 'users.create', data)

// Runtime:
// 1. workflowState.getStepState(runId, 'createUser') → { status: 'pending' }
// 2. queue.add('workflow-onboarding-createUser', { runId, stepName: 'createUser', rpcName: 'users.create', data })
// 3. workflowState.setStepScheduled(runId, 'createUser')
// 4. throw WorkflowAsyncException({ runId, stepName: 'createUser' })
// 5. [Queue worker executes, stores result]
// 6. [Orchestrator triggered again]
```

**Replay (after result cached):**

```typescript
const user = await workflow.do('createUser', 'users.create', data)

// Runtime:
// 1. workflowState.getStepState(runId, 'createUser') → { status: 'done', result: {...} }
// 2. return cached result (queue job NOT scheduled)
```

### Inline Form Execution

**First execution:**

```typescript
const taxRate = await workflow.do('calcTax', () => {
  return data.amount * 0.08
})

// Runtime:
// 1. workflowState.getStepState(runId, 'calcTax') → { status: 'pending' }
// 2. Execute function: result = () => data.amount * 0.08
// 3. workflowState.setStepResult(runId, 'calcTax', result)
// 4. return result
```

**Replay:**

```typescript
const taxRate = await workflow.do('calcTax', () => {
  return data.amount * 0.08
})

// Runtime:
// 1. workflowState.getStepState(runId, 'calcTax') → { status: 'done', result: 8.0 }
// 2. return cached result (function NOT executed)
```

### User Responsibility: Deterministic Steps

Cache keys must be deterministic:

❌ **Non-deterministic** (breaks replay):

```typescript
await workflow.do(`step-${Math.random()}`, ...)
await workflow.do(`step-${Date.now()}`, ...)
```

✅ **Deterministic** (safe):

```typescript
await workflow.do(`step-${data.userId}`, ...)
await workflow.do('createUser', ...)
```

Inline functions must be deterministic (same inputs → same outputs):

❌ **Non-deterministic inline** (breaks replay):

```typescript
await workflow.do('random', () => Math.random())
await workflow.do('timestamp', () => Date.now())
```

✅ **Deterministic inline**:

```typescript
await workflow.do('calcTax', () => data.amount * 0.08)
await workflow.do('enrichOrder', () => ({
  ...order,
  total: order.subtotal + order.tax,
}))
```

---

## Choosing Between RPC and Inline Forms

### Use RPC Form When:

✅ **External service calls**

```typescript
await workflow.do('chargePayment', 'stripe.charge', { amount: 100 })
```

✅ **Database operations**

```typescript
await workflow.do('saveUser', 'users.create', userData)
```

✅ **Long-running operations** (> 1 second)

```typescript
await workflow.do('processVideo', 'media.transcode', { videoId })
```

✅ **Operations that might fail** (need retries)

```typescript
await workflow.do('sendEmail', 'email.send', { to, subject, body })
```

✅ **Reusable across workflows**

```typescript
// Same RPC used by multiple workflows
await workflow.do('notifyAdmin', 'admin.notify', { event })
```

### Use Inline Form When:

✅ **Fast calculations** (< 100ms)

```typescript
await workflow.do('calcTotal', () => {
  return items.reduce((sum, item) => sum + item.price, 0)
})
```

✅ **Data transformations**

```typescript
await workflow.do('enrichOrder', () => ({
  ...order,
  total: order.subtotal + order.tax,
  timestamp: Date.now(),
}))
```

✅ **Validation logic**

```typescript
await workflow.do('validateInput', () => {
  if (!data.email.includes('@')) {
    throw new Error('Invalid email')
  }
  return true
})
```

✅ **Wrapping RPC for caching without dedicated worker**

```typescript
await workflow.do('fetchConfig', async () => {
  return await rpc.invoke('config.get', {})
})
```

✅ **Conditional logic results**

```typescript
const tier = await workflow.do('determineTier', () => {
  return user.isPremium ? 'premium' : 'standard'
})
```

### Use Bare `rpc.invoke()` When:

✅ **Quick lookups you don't need to cache**

```typescript
const config = await rpc.invoke('config.get', {})
// Fresh on every replay - fine for config lookups
```

✅ **Read operations that are idempotent and fast**

```typescript
const status = await rpc.invoke('order.getStatus', { orderId })
```

✅ **Helper data that doesn't affect workflow logic**

```typescript
const metadata = await rpc.invoke('metadata.get', {})
logger.info('Metadata', metadata)
```

---

## Workflow Patterns

### Sequential Steps with Descriptions

```typescript
await workflow.do('createAccount', 'accounts.create', data, {
  description: 'Create primary account record',
})

await workflow.do('setupPayment', 'stripe.createCustomer', data, {
  description: 'Initialize Stripe customer and payment method',
})

await workflow.do('sendWelcome', 'email.sendTemplate', data, {
  description: 'Send welcome email with getting started guide',
})
```

### Natural Branching

```typescript
const user = await workflow.do('createUser', 'users.create', data)

if (user.requiresKYC) {
  await workflow.do(
    'initiateKYC',
    'kyc.start',
    { userId: user.id },
    {
      description: 'Start KYC verification process',
    }
  )

  await workflow.do(
    'waitForKYC',
    'kyc.wait',
    { userId: user.id },
    {
      description: 'Wait for KYC approval (may take days)',
    }
  )
}

await workflow.do('activateAccount', 'accounts.activate', { userId: user.id })
```

### Dynamic Steps with Descriptions

```typescript
// Process items with unique cache keys
for (const item of data.items) {
  const cacheKey = `processItem-${item.id}`
  await workflow.do(cacheKey, 'items.process', item, {
    description: `Process ${item.type} item`,
  })
}
```

### Step Versioning

```typescript
// Version 1 (existing workflows continue using this)
await workflow.do('migrateData-v1', 'migration.legacyProcess', data)

// Version 2 (new workflows use optimized version)
await workflow.do('migrateData-v2', 'migration.optimizedProcess', data, {
  description: 'Migrate user data (fast path)',
})
```

### Mixing RPC and Inline Forms

```typescript
// RPC form - external API
const order = await workflow.do('createOrder', 'orders.create', data)

// Inline form - calculation
const tax = await workflow.do(
  'calculateTax',
  () => {
    return order.subtotal * 0.08
  },
  {
    description: 'Calculate sales tax',
  }
)

// Inline form - enrichment
const enriched = await workflow.do('enrichOrder', () => ({
  ...order,
  tax,
  total: order.subtotal + tax,
}))

// RPC form - payment
await workflow.do('chargePayment', 'stripe.charge', {
  amount: enriched.total,
  customerId: order.customerId,
})
```

---

## Integration Points

### 1. Services

Add `workflowState: WorkflowStateService` to `CoreSingletonServices`:

```typescript
// User's service factory
export function createWorkflowStateService() {
  return new SQLiteWorkflowStateService({
    path: './workflow.db',
  })
}
```

### 2. Queue Integration

Remote mode uses existing queue infrastructure:

```typescript
// Queue service used to schedule steps
await queue.add('workflow-onboarding-createUser', {
  runId,
  stepName,
  rpcName,
  data,
})
```

### 3. RPC Integration

Steps execute via existing `rpc.invoke()`:

```typescript
const result = await rpc.invoke('users.create', data)
```

### 4. Middleware

Workflows support middleware like other wirings:

```typescript
wireWorkflow({
  name: 'onboarding',
  func: onboarding,
  middleware: [loggingMiddleware, metricsMiddleware],
})
```

---

## Implementation Plan

### Phase 1: Core Infrastructure

1. Create `@pikku/core/wirings/workflow` types & runner
2. Add `WorkflowStateService` abstract class
3. Update `pikku-state.ts` with workflow registrations
4. Create `@pikku/services-workflow-memory` for tests

### Phase 2: Inspector & AST

1. Create `add-workflow.ts` inspector
2. Implement AST parsing for `workflow.do()` calls
3. Detect form by analyzing 2nd argument (string vs function)
4. Extract stepName, rpcName (RPC form), description
5. Mark dynamic values as `'<dynamic>'`
6. Emit warnings for dynamic stepName without description
7. Build metadata with form distinction
8. Store in `InspectorState.workflows`

### Phase 3: Codegen

1. Create workflow CLI commands
2. Generate entry functions
3. Generate orchestrator queue (handles both forms)
4. Generate per-step queue workers (RPC form only)
5. Inline form: no worker generation (executes in orchestrator)
6. Generate type-safe client API

### Phase 4: SQLite Implementation

1. Create `@pikku/services-workflow-sqlite`
2. Implement schema & migrations
3. Add locking mechanism

### Phase 5: Documentation

1. Create workflow skill
2. Add examples (onboarding, order fulfillment, patterns)
3. Write core concepts doc
4. Add API reference

---

## Key Decisions

✅ **Two forms of workflow.do()**: RPC (queued) and Inline (local, cached)
✅ **stepName = cache key** (required, immutable, affects execution)
✅ **options.description = display** (optional, mutable, UI only)
✅ **Inspector differentiates forms** by 2nd argument type
✅ **RPC form generates queue workers**, inline form executes in orchestrator
✅ **Dynamic step names supported** (user ensures determinism)
✅ **Bare rpc.invoke() still works** (not cached, not tracked)
✅ **Execution mode configurable** (inline workflow vs remote workflow)
✅ **Abstract state service** (pluggable implementations)
✅ **Queue-based retries** (via existing queue infrastructure)
✅ **Natural code branching** (no special metadata)

---

This proposal aligns with Pikku's architecture, reuses existing infrastructure (queues, RPC, services), and provides a clear path to implementation with explicit step caching and dual execution forms.
