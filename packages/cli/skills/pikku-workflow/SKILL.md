---
name: pikku-workflow
description: 'Use when building multi-step workflows, state machines, or orchestration pipelines with Pikku. Covers pikkuWorkflowFunc, workflow steps (do, sleep, suspend), graph workflows, and HTTP wiring.
TRIGGER when: code uses pikkuWorkflowFunc/pikkuWorkflowGraph, user asks about workflows, multi-step processes, durable execution, suspend/resume, or DAG orchestration.
DO NOT TRIGGER when: user asks about simple background jobs (use pikku-queue) or scheduled tasks (use pikku-cron).'
installGroups: [core]
---

# Pikku Workflow Wiring

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Build durable, multi-step workflows with automatic retry, sleep, suspend/resume, and parallel execution. Steps are cached for replay safety.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions that can be workflow steps
pikku info tags --verbose        # Understand project organization
```

See `pikku-concepts` for the core mental model.

## API Reference

### `pikkuWorkflowFunc<TInput, TOutput>(fn)`

```typescript
import { pikkuWorkflowFunc } from '#pikku'

const myWorkflow = pikkuWorkflowFunc<InputType, OutputType>(
  async (services, data, { workflow }) => {
    // workflow.do(), workflow.sleep(), workflow.suspend()
    return result
  }
)
```

### Workflow Step Types

```typescript
// RPC step — run a named Pikku function as a step
// workflow.do(stepName, funcName, data, options?)
const result = await workflow.do(
  'Create profile',
  'createUserProfile',
  {
    email: data.email,
  },
  { retries: 3, retryDelay: '1s' }
)

// Inline closure step — immediate execution, cached for replay
// workflow.do(stepName, asyncFn)
const result = await workflow.do('Generate message', async () => {
  return `Welcome, ${data.email}!`
})
```

### Step execution: inline vs queue dispatch

Whether a step runs **inline** (same process/session, no queue round-trip) or is **dispatched to the queue** is decided **purely by the step's function** — there is no workflow-level or per-call `inline` flag.

- **Steps default to inline.** Most steps don't need their own worker; running them inline avoids a queue round-trip per step, so a normally-started workflow executes its whole chain in one orchestrator pass.
- **`inline: false` opts a function out.** Set `inline: false` on the **function config** (`pikkuFunc` / `pikkuSessionlessFunc`, same level as `auth`/`expose`) to dispatch that step via the queue — for expensive/long-running steps that deserve their own worker, retry isolation, and concurrency limits. It is **not** a `workflow.do(...)` option (those are only `retries`/`retryDelay`/`description`).

The rule (`dispatchStep`):

| Function `inline` | `queueService` present? | Result |
|---|---|---|
| default / `true` | any | **inline** |
| `false` | yes | **queued** (own worker) |
| `false` | no | **inline + a `logger.warn`** (misconfiguration: can't dispatch) |

```typescript
// Push this one expensive step onto the queue; every other step stays inline:
export const renderLargeReport = pikkuSessionlessFunc({
  inline: false, // dispatch via queue instead of running inline
  input: ReportInput,
  output: ReportOutput,
  func: async (services, data) => { /* ... */ },
})
```

- **Run-level `inline` is separate** and only controls whether the *whole run* executes in-process without queue infrastructure (it's set automatically when there is no `queueService`, or via `startWorkflow(..., { inline: true })`). It governs sleep handling, **not** per-step dispatch — step dispatch is always per-function.
- `inline: false` requires a `queueService`; without one the step still runs (so the workflow progresses) but emits a `logger.warn` so the misconfiguration is visible.

// Sleep — durable pause (duration: '5min', '1h', '30s', '1d')
await workflow.sleep('Wait 5 minutes', '5min')

// Suspend — pause until externally resumed
await workflow.suspend('Awaiting approval')
```

### Choosing the right wrapper

| Wrapper | When to use |
|---|---|
| `pikkuWorkflowFunc` | **Default.** Use for all new workflows. DSL mode — serialisable, replay-safe. |
| `pikkuWorkflowComplexFunc` | **Only with explicit user approval.** For workflows with patterns the DSL extractor cannot handle (e.g. dynamic inline functions). Not a general escape hatch — restructure first. |
| `pikkuWorkflowGraph` | **Only with explicit user approval.** For genuine DAGs where there is a cyclic dependency between nodes or a Node.js-only import DSL cannot express. |

**Conditional results** — the correct DSL pattern when a step only runs under some condition:

```typescript
// ✅ Declare at top level, assign inside block
let result: { id: string } | null = null
if (input.createFoo) {
  result = await workflow.do('Create foo', 'createFoo', { ... })
}
// Use result?.id downstream

// ❌ Do NOT declare const inside a block — DSL forbids block-scoped declarations
// ❌ Do NOT switch to pikkuWorkflowComplexFunc to avoid the restriction
```

### `pikkuWorkflowGraph(config)` — DAG Workflows

```typescript
import { pikkuWorkflowGraph } from '#pikku'

pikkuWorkflowGraph({
  description: 'Onboard a new user',
  nodes: {
    createProfile: 'createUserProfile', // nodeName → Pikku function name
    sendWelcome: 'sendEmail',
  },
  config: {
    createProfile: {
      next: ['sendWelcome'], // Nodes to run after this one (parallel)
    },
    sendWelcome: {
      input: (ref) => ({
        // Transform input using refs to prior node outputs
        to: ref('createProfile', 'email'),
        subject: 'Welcome!',
      }),
    },
  },
})
```

### HTTP Workflow Wiring

```typescript
// Start a workflow
wireHTTP({
  method: 'post',
  route: '/workflow/onboard',
  func: workflowStart('workflowName'),
})

// Execute workflow steps (called by orchestrator)
wireHTTP({
  method: 'post',
  route: '/workflow/onboard/run',
  func: workflow('workflowName'),
})

// Check workflow status
wireHTTP({
  method: 'get',
  route: '/workflow/status/:runId',
  func: workflowStatus('workflowName'),
})
```

## Usage Patterns

### Sequential Workflow

```typescript
const onboardUser = pikkuWorkflowFunc<
  { email: string; userId: string },
  { success: boolean }
>(async ({}, data, { workflow }) => {
  const user = await workflow.do('Create profile', 'createUserProfile', {
    email: data.email,
    userId: data.userId,
  })

  const message = await workflow.do(
    'Generate welcome',
    async () => `Welcome, ${data.email}!`
  )

  await workflow.sleep('Wait 5 minutes', '5min')

  await workflow.do('Send email', 'sendEmail', {
    to: data.email,
    subject: 'Welcome!',
    body: message,
  })

  return { success: true }
})
```

### Parallel Execution (Fan-out)

```typescript
const users = await Promise.all(
  data.userIds.map(
    async (userId) =>
      await workflow.do(`Get user ${userId}`, 'userGet', { userId })
  )
)
```

### Retry with Backoff

```typescript
const payment = await workflow.do(
  'Process payment',
  'processPayment',
  { amount: 100 },
  { retries: 3, retryDelay: '1s' }
)
```

### Conditional Branching

```typescript
if (user.plan === 'pro') {
  await workflow.do('Apply discount', 'applyDiscount', { userId })
}
```

### Suspend and Resume

```typescript
const approval = pikkuWorkflowFunc<
  { requestId: string },
  { approved: boolean }
>(async ({}, data, { workflow }) => {
  await workflow.do('Submit request', 'submitRequest', data)
  await workflow.suspend('Awaiting approval')
  // Workflow pauses here until externally resumed
  const result = await workflow.do('Check result', 'getApprovalResult', data)
  return { approved: result.approved }
})
```

### Graph Workflow (DAG)

```typescript
const userOnboarding = pikkuWorkflowGraph({
  description: 'Onboard a new user',
  nodes: {
    createProfile: 'createUserProfile',
    sendWelcome: 'sendEmail',
    setupDefaults: 'createDefaultTodos',
  },
  config: {
    createProfile: {
      next: ['sendWelcome', 'setupDefaults'], // Run in parallel
    },
    sendWelcome: {
      input: (ref) => ({
        to: ref('createProfile', 'email'),
        subject: 'Welcome!',
      }),
    },
  },
})
```

## Complete Example

```typescript
// functions/onboarding.workflow.ts
export const onboardUser = pikkuWorkflowFunc<
  { email: string; userId: string; plan: string },
  { success: boolean }
>(async ({}, data, { workflow }) => {
  // Step 1: Create user profile
  const user = await workflow.do('Create profile', 'createUserProfile', {
    email: data.email,
    userId: data.userId,
  })

  // Step 2: Set up defaults based on plan
  if (data.plan === 'pro') {
    await workflow.do('Apply pro features', 'enableProFeatures', {
      userId: data.userId,
    })
  }

  // Step 3: Send welcome email
  await workflow.do('Send welcome', 'sendEmail', {
    to: data.email,
    subject: 'Welcome!',
    body: `Welcome to our platform, ${user.name}!`,
  })

  // Step 4: Wait then send follow-up
  await workflow.sleep('Wait 1 day', '1d')

  await workflow.do('Send follow-up', 'sendEmail', {
    to: data.email,
    subject: 'Getting started',
    body: 'Here are some tips to get started...',
  })

  return { success: true }
})

// wirings/workflow.wiring.ts
wireHTTP({
  method: 'post',
  route: '/onboard',
  func: workflowStart('onboardUser'),
})

wireHTTP({
  method: 'post',
  route: '/onboard/run',
  func: workflow('onboardUser'),
})

wireHTTP({
  method: 'get',
  route: '/onboard/status/:runId',
  func: workflowStatus('onboardUser'),
})
```
