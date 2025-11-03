# Phase 3.2: Runtime Execution - Complete

## ✅ Implementation Summary

Phase 3.2 adds full runtime execution capabilities to Pikku workflows, including:
- Automatic queue worker generation for RPC steps
- Orchestrator queue worker generation
- Runtime replay logic with step caching
- WorkflowAsyncException handling for pause/resume

---

## 🆕 Files Created

### 1. Worker Generator
**File:** `packages/cli/src/functions/wirings/workflow/serialize-workflow-workers.ts`

**Generates:**
- One queue worker per RPC form step
- One orchestrator worker per workflow

**Example Generated Code:**
```typescript
// RPC Step Worker
wireQueueWorker({
  queueName: 'workflow-onboarding-createUser',
  func: pikkuFunc(async ({ rpc, workflowState, queue }, payload: any) => {
    const { runId, stepName, rpcName, data } = payload

    // Idempotency check
    const stepState = await workflowState.getStepState(runId, stepName)
    if (stepState.status === 'done') return

    // Execute RPC
    const result = await rpc.invoke(rpcName, data)
    await workflowState.setStepResult(runId, stepName, result)

    // Trigger orchestrator
    await queue.add('workflow-onboarding-orchestrator', { runId })
  }),
})

// Orchestrator Worker
wireQueueWorker({
  queueName: 'workflow-onboarding-orchestrator',
  func: pikkuFunc(async ({ workflowState, queue }, payload: any) => {
    const { runId } = payload
    await runWorkflowJob(runId, { workflowState, queue } as any)
  }),
})
```

---

## 🔧 Files Modified

### 1. CLI Configuration
- **`packages/cli/types/config.d.ts`** - Added `workflowsWorkersFile`
- **`packages/cli/src/utils/pikku-cli-config.ts`** - Added default path for workers file

### 2. CLI Command
- **`packages/cli/src/functions/wirings/workflow/pikku-command-workflow.ts`**
  - Import `serializeWorkflowWorkers`
  - Generate workers file
  - Write to `workflowsWorkersFile`

### 3. Build Pipeline
- **`packages/cli/src/functions/commands/all.ts`**
  - Import `workflowsWorkersFile` in bootstrap

### 4. Runtime Core
- **`packages/core/src/wirings/workflow/workflow-runner.ts`**
  - Implement `startWorkflow()` with queue scheduling
  - Implement `runWorkflowJob()` with replay logic
  - Create `PikkuWorkflowInteraction` object
  - Implement `workflow.do()` for both RPC and Inline forms
  - Implement `workflow.sleep()`
  - Add `parseDuration()` helper

---

## 🎯 How It Works

### 1. Starting a Workflow

```typescript
// User code
const { runId } = await workflows.onboarding.start({ email: 'user@example.com' })
```

**What happens:**
1. `startWorkflow()` creates run in `WorkflowStateService`
2. If `executionMode: 'remote'`:
   - Enqueues orchestrator: `queue.add('workflow-onboarding-orchestrator', { runId })`
3. If `executionMode: 'inline'`:
   - Calls `runWorkflowJob()` directly

---

### 2. Workflow Execution (Replay with Caching)

**Orchestrator calls `runWorkflowJob(runId)`:**

1. **Acquire lock** - Prevents concurrent execution
2. **Create workflow interaction** - Provides `workflow.do()` and `workflow.sleep()`
3. **Execute workflow function** - Calls user's workflow with `workflowInteraction`
4. **Handle steps:**

#### RPC Form Step:
```typescript
const user = await workflow.do('createUser', 'users.create', data)
```

**Execution flow:**
- Check step state
- If `done` → Return cached result
- If `scheduled` → Throw `WorkflowAsyncException` (pause)
- If `pending`:
  - Mark as `scheduled`
  - Enqueue step worker: `queue.add('workflow-onboarding-createUser', { runId, stepName, rpcName, data })`
  - Throw `WorkflowAsyncException` (pause)

#### Inline Form Step:
```typescript
const taxRate = await workflow.do('calcTax', () => data.amount * 0.08)
```

**Execution flow:**
- Check step state
- If `done` → Return cached result
- If `pending`:
  - Execute function
  - Cache result
  - Return result

5. **Completion:**
   - If function completes → Mark workflow as `completed`
   - If `WorkflowAsyncException` → Workflow paused (normal)
   - If other error → Mark workflow as `failed`

---

### 3. Step Worker Execution

When RPC step worker runs:

1. Check idempotency (skip if already done)
2. Execute RPC via `rpc.invoke(rpcName, data)`
3. Store result in workflow state
4. Trigger orchestrator to continue: `queue.add('workflow-onboarding-orchestrator', { runId })`

---

### 4. Replay After Step Completion

When orchestrator runs again:

1. Workflow function executes from beginning
2. Previous steps return cached results (fast)
3. Newly completed step returns its result
4. Execution continues to next step

---

## 🔐 Key Features

### Deterministic Replay
- Steps cache results by `stepName`
- Replay always follows same path
- Non-deterministic code (Math.random(), Date.now()) should be wrapped in steps

### Idempotency
- RPC step workers check state before execution
- Safe to retry - won't duplicate work
- File locks prevent concurrent modifications

### Error Handling
- Step errors are caught and stored
- Workflow marked as failed
- Error includes message, stack, and code

### Execution Modes

**Remote (Queue-Based):**
```typescript
wireWorkflow({
  name: 'onboarding',
  executionMode: 'remote', // Default
  func: onboardingFunc,
})
```
- Steps run in separate queue workers
- Full durability and retries
- Survives process restarts

**Inline (Synchronous):**
```typescript
wireWorkflow({
  name: 'onboarding',
  executionMode: 'inline',
  func: onboardingFunc,
})
```
- All steps run in single process
- RPC form steps still generate workers (but not used)
- Useful for testing/development

---

## 📊 Generated Files

When users run `npx pikku prebuild`:

```
.pikku/workflow/
├── pikku-workflow-wirings.gen.ts        # Imports all wireWorkflow() calls
├── pikku-workflow-wirings-meta.gen.ts   # Workflow metadata
├── pikku-workflow-workers.gen.ts        # ⭐ NEW: Queue workers
├── pikku-workflow-map.gen.d.ts          # Type-safe client API
└── pikku-workflow-types.gen.ts          # wireWorkflow type wrapper
```

---

## 🎉 What Works Now

### ✅ Full Workflow Execution
- Define workflows with `wireWorkflow()`
- Start workflows with `workflows.name.start(input)`
- Execute RPC steps with queue workers
- Execute inline steps with caching
- Workflow pause/resume on step completion
- Deterministic replay after failures

### ✅ Queue Integration
- Automatic worker generation
- Step-level isolation
- Orchestrator coordination
- Retry capabilities (via queue)

### ✅ State Management
- File-based state service
- Step result caching
- Run status tracking
- Concurrent execution prevention (locks)

---

## 📝 Example Workflow

```typescript
// Define workflow
export const onboarding = pikkuFunc(async ({ workflow, rpc }, data) => {
  // RPC form - queued execution
  const user = await workflow.do(
    'createUser',
    'users.create',
    { email: data.email },
    { description: 'Create user account' }
  )

  // Inline form - local execution, cached
  const taxRate = await workflow.do(
    'calculateTaxRate',
    () => user.region === 'EU' ? 0.2 : 0.08,
    { description: 'Calculate tax rate' }
  )

  // RPC form - external API
  await workflow.do(
    'sendEmail',
    'email.send',
    { to: user.email, subject: 'Welcome!' },
    { description: 'Send welcome email' }
  )

  // Sleep
  await workflow.sleep('5s', { description: 'Wait for email delivery' })

  return { userId: user.id, taxRate }
})

wireWorkflow({
  name: 'onboarding',
  description: 'User onboarding workflow',
  executionMode: 'remote',
  func: onboarding,
})

// Use workflow
const { runId } = await workflows.onboarding.start({
  email: 'user@example.com'
})

// Check status
const run = await workflows.onboarding.getRun(runId)
console.log(run.status) // 'running', 'completed', or 'failed'
console.log(run.output) // { userId: '123', taxRate: 0.08 }
```

---

## 🔄 Execution Flow Diagram

```
User calls workflows.onboarding.start(input)
  ↓
startWorkflow() creates run in state
  ↓
Enqueue: workflow-onboarding-orchestrator
  ↓
Orchestrator calls runWorkflowJob(runId)
  ↓
Execute workflow function from start
  ↓
Hit workflow.do('createUser', 'users.create', data)
  ↓
Check state: pending → schedule step worker
  ↓
Enqueue: workflow-onboarding-createUser
  ↓
Throw WorkflowAsyncException (pause orchestrator)
  ↓
Step worker executes rpc.invoke('users.create', data)
  ↓
Store result in state
  ↓
Enqueue: workflow-onboarding-orchestrator (resume)
  ↓
Orchestrator replays from start
  ↓
workflow.do('createUser', ...) returns cached result
  ↓
Continue to next step...
  ↓
Hit workflow.do('calculateTaxRate', () => ...)
  ↓
Check state: pending → execute inline, cache result
  ↓
Continue...
  ↓
Workflow function completes
  ↓
Mark run as 'completed', store output
```

---

## 🚀 Performance Characteristics

### Replay Overhead
- Cached steps return instantly (no re-execution)
- Only new steps execute
- File I/O for state checks (optimizable with Redis/Postgres)

### Scalability
- Each step worker can scale independently
- Orchestrator is lightweight (just replay logic)
- State service is pluggable (file/Redis/Postgres)

### Fault Tolerance
- Survives process crashes (queue durability)
- No duplicate work (idempotency)
- Automatic retries (via queue configuration)

---

## 📚 Files Summary

**New Files (1):**
- `packages/cli/src/functions/wirings/workflow/serialize-workflow-workers.ts`

**Modified Files (5):**
- `packages/cli/types/config.d.ts`
- `packages/cli/src/utils/pikku-cli-config.ts`
- `packages/cli/src/functions/wirings/workflow/pikku-command-workflow.ts`
- `packages/cli/src/functions/commands/all.ts`
- `packages/core/src/wirings/workflow/workflow-runner.ts`

**Total: 6 files (1 new, 5 modified)**

---

## 🎯 Complete Implementation

Phase 3.2 completes the workflow implementation:
- ✅ Phase 1: Core infrastructure
- ✅ Phase 2: Inspector & step detection
- ✅ Phase 3: Codegen
- ✅ **Phase 3.2: Runtime execution** ← YOU ARE HERE

**Workflows are now fully functional end-to-end!** 🎉
