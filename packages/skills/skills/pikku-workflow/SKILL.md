---
name: pikku-workflow
description: >-
  Use when building multi-step workflows, state machines, or orchestration pipelines with Pikku.
  Covers pikkuWorkflowFunc, workflow steps (do, sleep, suspend), graph workflows, and HTTP wiring.
  TRIGGER when: code uses pikkuWorkflowFunc/pikkuWorkflowGraph, user asks about workflows,
  multi-step processes, durable execution, suspend/resume, or DAG orchestration. DO NOT TRIGGER
  when: user asks about simple background jobs (use pikku-queue) or scheduled tasks (use
  pikku-schedule).
installGroups: [core]
---

# Pikku Workflow Wiring

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Capture baseline. Run `pikku-verify` (or `pikku all`) BEFORE writing code; note existing errors — only NEW errors are yours to fix.
2. Discover before editing. Prefer `pikku-meta` / `pikku info functions --verbose` and `pikku info tags --verbose` to see functions usable as steps and project organization; inspect only the focused output you need.
3. Identify the source files that own the behavior. Do not start from generated output, `.pikku`, `node_modules`, vendored packages, or build artifacts.
4. Make the smallest source change. Keep generated files generated — never hand-edit SDKs, schema output, or typegen to paper over errors; fix the source cause.
5. Validate with the narrowest relevant command, then re-run `pikku-verify`. If only files you did not touch still error, those are pre-existing — leave them unless asked.
6. Call `pikku-workflow-view` only when `pikku-verify` fully passes (codegen AND type check both green) — never after a partial pass.

See `pikku-concepts` for the core mental model.

Build durable, multi-step workflows with automatic retry, sleep, suspend/resume, and parallel execution. Steps are cached for replay safety.

## Choosing the right factory

| Factory                    | When to use                                                                                                                                                                                                | Step-graph view?              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `pikkuWorkflowFunc`        | **Default for all new workflows.** Sequential + conditional logic; DSL mode (serialisable, replay-safe). ALL `const`/`let` declarations must be at the top level of the function body (not inside blocks). | ✅ Yes                        |
| `pikkuWorkflowGraph`       | DAG / fan-out with nodes and typed refs between them.                                                                                                                                                      | ✅ Yes                        |
| `pikkuWorkflowComplexFunc` | Escape hatch only — arbitrary TypeScript, no top-level restriction (e.g. dynamic inline functions the DSL extractor cannot handle).                                                                        | ❌ No (loses step-graph view) |

**Default to `pikkuWorkflowFunc`.** Use `pikkuWorkflowGraph` ONLY with explicit user approval AND only for a genuine cyclic dependency or Node.js-only import DSL cannot express. Use `pikkuWorkflowComplexFunc` ONLY with explicit user approval — a last-resort escape hatch. Never switch to either just to dodge a PKU641 error; restructure the code instead.

### PKU641 — DSL static analysis error

`pikkuWorkflowFunc` statically analyzes the body: **every `const`/`let` must be top-level, not inside any block (`if`, `for`, `while`, …).** Assignments inside blocks are fine — only declarations trigger it.

```typescript
// ❌ PKU641 — declaration inside block
if (priority === 'high') {
  const bugCard = await workflow.do(...)
}

// ✅ hoist the declaration, assign inside the block
let bugCard: Awaited<ReturnType<typeof workflow.do>>
if (priority === 'high') {
  bugCard = await workflow.do(...)
}
```

## Import path

```typescript
// CORRECT — workflow factories come from the generated types file
import {
  pikkuWorkflowFunc,
  pikkuWorkflowGraph,
  pikkuWorkflowComplexFunc,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

// WRONG — the function leaf does not re-export them (TS2305)
import { pikkuWorkflowFunc } from '#pikku/function'
```

## Defining a workflow

Declare input/output as Zod schemas (like any function) — never TypeScript generic params (no `pikkuWorkflowFunc<In, Out>(...)`; that skips runtime validation). `data` is typed from the input schema.

```typescript
import { z } from 'zod'
import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

const ProcessOrderInput = z.object({ orderId: z.string(), amount: z.number() })
const ProcessOrderOutput = z.object({
  status: z.string(),
  discount: z.number().optional(),
})

export const processOrder = pikkuWorkflowFunc({
  description: 'Process an order through payment and fulfillment',
  tags: ['orders'],
  input: ProcessOrderInput,
  output: ProcessOrderOutput,
  func: async (services, data, { workflow }) => {
    // Declare ALL variables at top level — even those only assigned in branches (PKU641)
    let discount: number | undefined
    let status: string

    if (data.amount > 1000) {
      const d = await workflow.do('Apply bulk discount', 'calcDiscount', {
        amount: data.amount,
      })
      discount = d.discountPercent
    }

    const payment = await workflow.do('Charge', 'chargePayment', {
      orderId: data.orderId,
      amount: discount ? data.amount * (1 - discount / 100) : data.amount,
    })

    if (payment.success) {
      await workflow.do('Fulfill', 'fulfillOrder', { orderId: data.orderId })
      status = 'fulfilled'
    } else {
      status = 'payment-failed'
    }

    return { status, discount }
  },
})
```

### Workflow step types

```typescript
// RPC step — run a registered Pikku function as a step (opts: retries, retryDelay, description)
const result = await workflow.do('Step name', 'rpcFunctionName', { ...data }, { retries: 3, retryDelay: '1s' })

// Inline closure step — immediate execution, cached for replay
const msg = await workflow.do('Generate', async () => `Welcome, ${data.email}!`)

// Sleep — durable pause (duration: '30s', '5min', '1h', '1d')
await workflow.sleep('Wait 5 minutes', '5min')

// Suspend — pause until externally resumed (e.g. awaiting approval), then continue
await workflow.suspend('Awaiting approval')

// Approval — suspend for a human decision and resume with the answer
await workflow.approval('Manager sign-off', { ... })
```

`workflow.name`, `workflow.runId` and `await workflow.getRun()` identify the
current run if a step needs to reference it.

### Approval gates: who may answer

`workflow.approval(reason, options)` takes a `schema` (a runtime value — the
payload arrives from an untrusted caller, so a type generic would validate
nothing), an optional `expiry`, and an optional policy for **who** may answer:

```typescript
const signOff = await workflow.approval('Manager sign-off', {
  schema: SignOffSchema,
  expiry: '3d',
  approvers: 'not-initiator',      // four-eyes: anyone but whoever started the run
  approverScope: 'payments:approve', // and they must hold this scope
})
if (signOff.status === 'expired') { ... }
```

`approvers` is one of:

| value             | who may answer                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `any` _(default)_ | anyone the approve entrypoint admits — the gate is a pause for a decision, not an authorization boundary |
| `owner`           | only the user who started the run                                                                        |
| `not-initiator`   | anyone **except** the user who started the run                                                           |

Both options are enforced in two phases, because a decision can legitimately
arrive before the run has reached the gate:

- **At submission**, if the run has already reached the gate. Reaching it
  publishes the policy into the run state, so the approve entrypoint can judge
  the caller against it and refuse with a **403**.
- **On replay**, for a decision that arrived before the gate — there was no
  policy to judge it against yet, so it is accepted and judged when the workflow
  reaches the gate. Failing there discards the decision and leaves the gate
  closed, exactly as a decision that fails the schema does.

So the same rejected decision surfaces as an HTTP error or as a silently
re-closed gate depending on timing. Both are audited.

A gate declaring neither option accepts a decision from anyone the approve
route lets through; gate the route with `auth`/`permissions` to narrow that.

#### What survives the run

A settled decision carries `decidedBy` and `decidedAt`, so the answer keeps its
provenance in the step result:

```typescript
if (signOff.status === 'decided') {
  logger.info(`signed by ${signOff.decidedBy?.userId} at ${signOff.decidedAt}`)
}
```

That record is deleted with the run, though — `deleteRun` cascades to steps and
history — and an attempt that was _refused_ never reaches a step at all. So
every answer is also written to the audit sink as `workflow.approval.decided`,
with `outcome: 'success' | 'denied'`, the decider under `userIdentity`, and the
run, reason and refusal in `metadata`. Wire an `audit` service to keep it; a
project without one records nothing and is otherwise unaffected.

### Error handling: `onError`, never try/catch

**Do not wrap steps in try/catch.** The DSL extractor serialises the body into a
step graph, and a `catch` block is control flow it cannot represent — so the
graph would no longer describe what actually runs, which is the whole point of
the DSL mode. This is a settled design decision, not a temporary limitation.

Use the `onError` step option instead: it names an RPC to invoke when the step
has failed _after_ exhausting its retries.

```typescript
await workflow.do(
  'Charge',
  'chargePayment',
  { orderId },
  {
    retries: 3,
    retryDelay: '1s',
    onError: 'refundReservation', // compensation RPC
  }
)
```

The handler receives `{ error: { message } }`, and the original error is still
thrown afterwards — so the workflow still fails. `onError` is **compensation, not
recovery**: it exists to undo work, not to swallow the failure and carry on. If
you genuinely need to branch on a failure, have the step return a result object
(`{ success: false, reason }`) and branch on that, the way the `processOrder`
example branches on `payment.success`.

Full step options: `description`, `retries`, `retryDelay`, `onError` (plus
`actor`, which is scenario-only — see `pikku-scenario`).

### Parallel fan-out

```typescript
const users = await Promise.all(
  data.userIds.map((userId) =>
    workflow.do(`Fetch user ${userId}`, 'getUser', { userId })
  )
)
```

### Graph workflow (DAG)

`pikkuWorkflowGraph` derives types from the RPC map — no explicit `input`/`output`. Nodes map `nodeName → Pikku function name`; `config.<node>.next` lists nodes to run after it (in parallel); `config.<node>.input: (ref) => ...` transforms input using refs to prior node outputs.

```typescript
import { pikkuWorkflowGraph } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const userOnboarding = pikkuWorkflowGraph({
  description: 'Onboard a new user',
  nodes: {
    createProfile: 'createUserProfile',
    sendWelcome: 'sendEmail',
    setupDefaults: 'createDefaultTodos',
  },
  config: {
    createProfile: { next: ['sendWelcome', 'setupDefaults'] }, // run in parallel
    sendWelcome: {
      input: (ref) => ({
        to: ref('createProfile', 'email'),
        subject: 'Welcome!',
      }),
    },
  },
})
```

## File conventions

- Place workflows in `packages/functions/src/wirings/*.workflow.ts`; export the variable so the inspector discovers it (no manual registration).
- HTTP start/run/status routes are auto-scaffolded via `scaffold.workflow` in `pikku.config.json`.

## Step dispatch & HTTP wiring

For per-step inline-vs-queue dispatch (`workflowQueued: true` and the `dispatchStep` rules), the manual `workflowStart`/`workflow`/`workflowStatus` HTTP wirings, and a suspend/resume example, read `references/workflow-reference.md`.

## After writing

1. `pikku-verify` (codegen + tsc).
2. PKU641 → a `const`/`let` is inside a block; hoist it to the top of the function body.
3. Import errors → use `#pikku/workflow/pikku-workflow-types.gen.js`, not `#pikku`.
4. Type errors only in files you did not touch → pre-existing template errors; safe to ignore.
5. Both green → call `pikku-workflow-view` with the workflow name.
