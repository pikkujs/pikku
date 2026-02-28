---
name: pikku-workflow
description: 'Use when building multi-step workflows, state machines, or orchestration pipelines with Pikku. Covers pikkuWorkflowFunc, workflow steps (do, sleep, suspend), graph workflows, and HTTP wiring.'
---

# Pikku Workflow Wiring

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
// RPC step — execute a Pikku function as a queue job
// workflow.do(stepName, funcName, data, options?)
const result = await workflow.do('Create profile', 'createUserProfile', {
  email: data.email,
}, { retries: 3, retryDelay: '1s' })

// Inline step — immediate execution, cached for replay
// workflow.do(stepName, asyncFn)
const result = await workflow.do('Generate message', async () => {
  return `Welcome, ${data.email}!`
})

// Sleep — durable pause (duration: '5min', '1h', '30s', '1d')
await workflow.sleep('Wait 5 minutes', '5min')

// Suspend — pause until externally resumed
await workflow.suspend('Awaiting approval')
```

### `pikkuWorkflowGraph(config)` — DAG Workflows

```typescript
import { pikkuWorkflowGraph } from '#pikku'

pikkuWorkflowGraph({
  description: 'Onboard a new user',
  nodes: {
    createProfile: 'createUserProfile',  // nodeName → Pikku function name
    sendWelcome: 'sendEmail',
  },
  config: {
    createProfile: {
      next: ['sendWelcome'],             // Nodes to run after this one (parallel)
    },
    sendWelcome: {
      input: (ref) => ({                 // Transform input using refs to prior node outputs
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
