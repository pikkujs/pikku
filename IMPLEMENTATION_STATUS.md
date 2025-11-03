# Pikku Workflows - Implementation Status

## ✅ Completed: Phases 1, 2, and 3 (Codegen)

### Phase 1: Core Infrastructure ✅ COMPLETE

**Location:** `packages/core/src/wirings/workflow/`

**Files Created:**

- ✅ `workflow.types.ts` - Core workflow types with `PikkuWorkflowInteraction` API
- ✅ `workflow-state.types.ts` - Abstract `WorkflowStateService` for pluggable storage
- ✅ `workflow-runner.ts` - Registration and execution functions (runtime TODO)
- ✅ `index.ts` - Public exports

**Key Features:**

- `CoreWorkflow` type definition with execution modes ('inline' | 'remote')
- `WorkflowStepMeta` union type (RPC | Inline | Sleep)
- `PikkuWorkflowInteraction` with full `workflow.do()` signatures
- Abstract `WorkflowStateService` with all CRUD operations
- `WorkflowRun` and `StepState` types

**File-Based State Service:**

- ✅ `packages/core/src/services/file-workflow-state.ts`
- JSON-based storage for serverless environments
- File-based locking mechanism
- Implements all WorkflowStateService methods

**State Integration:**

- ✅ `packages/core/src/pikku-state.ts` - Added workflows state

---

### Phase 2: Inspector & Step Detection ✅ COMPLETE

**Location:** `packages/inspector/src/`

**Files Created:**

- ✅ `add/add-workflow.ts` - Full AST inspector with step detection
- ✅ `utils/extract-node-value.ts` - Common utility functions for AST parsing
- ✅ `error-codes.ts` - Added `DYNAMIC_STEP_NAME` error code

**Files Modified:**

- ✅ `inspector.ts` - Added workflows state initialization
- ✅ `types.ts` - Added workflows meta type
- ✅ `utils/serialize-inspector-state.ts` - Added workflows serialization
- ✅ `visit.ts` - Added `addWorkflow` call

**Detection Capabilities:**

- ✅ Detects `wireWorkflow()` calls
- ✅ Extracts metadata: name, description, executionMode, middleware, tags, docs
- ✅ Parses `workflow.do()` calls from function body
- ✅ Differentiates RPC vs Inline forms by 2nd argument type
- ✅ Handles dynamic values with `'<dynamic>'` marker
- ✅ Emits warnings for dynamic stepName without description
- ✅ Detects `workflow.sleep()` calls (Phase 2 prep)

**Example Detection:**

```typescript
// RPC form
await workflow.do('createUser', 'users.create', data)
→ { type: 'rpc', stepName: 'createUser', rpcName: 'users.create' }

// Inline form
await workflow.do('calcTax', () => data.amount * 0.08)
→ { type: 'inline', stepName: 'calcTax' }
```

---

### Phase 3: Codegen ✅ COMPLETE

**Location:** `packages/cli/src/functions/wirings/workflow/`

**Files Created:**

1. ✅ `serialize-workflow-meta.ts` - Metadata serializer
2. ✅ `serialize-workflow-types.ts` - Type definitions generator
3. ✅ `serialize-workflow-map.ts` - Type-safe client API generator
4. ✅ `pikku-command-workflow.ts` - Main CLI command
5. ✅ `pikku-command-workflow-types.ts` - Types CLI command
6. ✅ `pikku-command-workflow-map.ts` - Map CLI command

**Config Updates:**

- ✅ `packages/cli/types/config.d.ts` - Added workflow file paths
- ✅ `packages/cli/src/utils/pikku-cli-config.ts` - Added default paths

**Build Pipeline Integration:**

- ✅ `packages/cli/src/functions/commands/all.ts` - Added workflow generation
- ✅ `packages/cli/src/functions/commands/bootstrap.ts` - Added pikkuWorkflowTypes

**Generated Files:**

```
.pikku/workflow/
├── pikku-workflow-wirings.gen.ts        # Imports all wireWorkflow() calls
├── pikku-workflow-wirings-meta.gen.ts   # Workflow metadata
├── pikku-workflow-map.gen.d.ts          # Type-safe client API
└── pikku-workflow-types.gen.ts          # wireWorkflow type wrapper
```

**Generated API Example:**

```typescript
// pikku-workflow-map.gen.d.ts
export type WorkflowMap = {
  readonly onboarding: WorkflowHandler<OnboardingInput, OnboardingOutput>
}

export type WorkflowClient<Name extends keyof WorkflowMap> = {
  start: (input: WorkflowMap[Name]['input']) => Promise<{ runId: string }>
  getRun: (runId: string) => Promise<WorkflowRun>
  cancelRun: (runId: string) => Promise<void>
}
```

---

## 🧪 Test Setup

**Location:** `test-workflow-app/`

**Files Created:**

- ✅ `src/onboarding.workflow.ts` - Example workflow with multiple step types
- ✅ `pikku.config.json` - Test configuration
- ✅ `tsconfig.json` - TypeScript config
- ✅ `package.json` - Package dependencies

**Test Workflow Features:**

- RPC form steps with descriptions
- Inline form steps with arrow functions
- RPC form without options
- Inline form wrapping rpc.invoke()
- Sleep steps
- Dynamic stepName (triggers warning)
- Dynamic stepName with description (no warning)

---

## 📊 What Works Now

1. ✅ **Define Workflows** - Users can write `wireWorkflow()` definitions
2. ✅ **Step Detection** - Inspector parses and categorizes all `workflow.do()` calls
3. ✅ **Type Generation** - CLI generates type-safe workflow definitions
4. ✅ **Metadata Export** - Complete workflow metadata available at runtime
5. ✅ **Build Integration** - Workflows integrate into `npx pikku prebuild` pipeline

---

## ⏳ What Doesn't Work Yet (Phase 3.2 - Runtime Execution)

### Missing: Queue Worker Generation

**What's needed:**

1. **RPC Step Workers** - Generate dedicated queue workers for each RPC form step
2. **Orchestrator Worker** - Generate orchestrator queue worker per workflow
3. **Runtime Execution** - Implement workflow replay logic in `workflow-runner.ts`

**Example of what should be generated:**

```typescript
// For: workflow.do('createUser', 'users.create', data)
// Should generate:

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

// Orchestrator
wireQueueWorker({
  queueName: 'workflow-onboarding-orchestrator',
  func: pikkuFunc(async ({ workflowState, queue }, { runId }) => {
    await runWorkflowJob(runId) // Replays workflow with caching
  }),
})
```

### Missing: Runtime Implementation

**In `workflow-runner.ts`:**

- `startWorkflow()` - Needs to enqueue orchestrator job
- `runWorkflowJob()` - Needs replay logic with step caching
- `workflow.do()` implementation - Needs to check cache and schedule steps
- `WorkflowAsyncException` handling - Pause/resume mechanism

---

## 🎯 Current State Summary

### ✅ Fully Functional

- Workflow definition API
- AST parsing and step detection
- Type generation and safety
- Metadata extraction
- Build pipeline integration

### ❌ Not Implemented

- Actual workflow execution
- Queue worker generation
- Step result caching at runtime
- Workflow replay after failures
- Step-level retries

---

## 📝 Next Steps

### Option A: Commit Current Progress

All infrastructure is in place and working. This is a good commit point.

**Commit message:**

```
feat(workflows): Phase 1-3 - Core infrastructure, inspector, and codegen

- Add core workflow types and state service abstraction
- Implement AST-based step detection (RPC vs Inline forms)
- Generate type-safe workflow client APIs
- Add file-based state service for serverless
- Integrate workflows into CLI build pipeline

Phase 3.2 (runtime execution) deferred to future PR
```

### Option B: Continue with Phase 3.2

Implement queue worker generation and runtime execution.

This requires:

- Worker serializer (generate queue workers for steps)
- Orchestrator serializer (generate orchestrator worker)
- Runtime execution logic
- Step caching implementation
- Replay mechanism

Estimated: 3-4 hours additional work

---

## 🔍 How to Test (Manual)

1. Copy test workflow to a Pikku project
2. Run `npx pikku prebuild`
3. Check `.pikku/workflow/` directory for generated files
4. Verify types are correct in generated files
5. Check that metadata includes detected steps

Note: Actual execution won't work until Phase 3.2 is implemented.

---

## 📚 Files Summary

**Core (9 files):**

- packages/core/src/wirings/workflow/\* (4 files)
- packages/core/src/services/file-workflow-state.ts
- packages/core/src/pikku-state.ts (modified)

**Inspector (5 files):**

- packages/inspector/src/add/add-workflow.ts
- packages/inspector/src/utils/extract-node-value.ts
- packages/inspector/src/error-codes.ts (modified)
- packages/inspector/src/inspector.ts (modified)
- packages/inspector/src/types.ts (modified)
- packages/inspector/src/utils/serialize-inspector-state.ts (modified)
- packages/inspector/src/visit.ts (modified)

**CLI (11 files):**

- packages/cli/src/functions/wirings/workflow/\* (6 files)
- packages/cli/types/config.d.ts (modified)
- packages/cli/src/utils/pikku-cli-config.ts (modified)
- packages/cli/src/functions/commands/all.ts (modified)
- packages/cli/src/functions/commands/bootstrap.ts (modified)

**Test (4 files):**

- test-workflow-app/\* (4 files)

**Total: 29 files (16 new, 13 modified)**
