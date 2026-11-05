---
name: pikku-workflow
description: >-
  Durable workflows: pikkuWorkflowFunc, workflow.do/sleep/suspend/approval, compensate. For multi-step work and anything a trigger starts (schedule, event, webhook, form submit), even with one step.
installGroups: [core]
---

# Pikku Workflow Wiring

Durable workflows with automatic retry, sleep, suspend/resume and parallel execution. Steps are cached for replay safety. Core model: `pikku-concepts`.

## Agent Operating Procedure

Use this as an execution checklist, not reference material.

1. Run `pikku all` BEFORE writing code and note existing errors; only NEW errors are yours. Errors only in files you did not touch are pre-existing template errors: leave them unless asked.
2. Discover before editing: `pikku meta`, `pikku info functions --verbose` and `pikku info tags --verbose` show functions usable as steps and project organization. Inspect only the focused output you need.
3. Start from the source files that own the behavior, not generated output, `.pikku`, `node_modules`, vendored packages or build artifacts.
4. Make the smallest source change. Never hand-edit SDKs, schema output or typegen to paper over errors; fix the source cause.
5. Validate with the narrowest relevant command, then `pikku all`, then `tsc --noEmit`.
6. Claim success only when `pikku all` and `tsc` both pass, never after a partial pass.

PKU641: a `const`/`let` is inside a block; hoist it to the top of the function body. Import errors: use `#pikku/workflow/pikku-workflow-types.gen.js`, not `#pikku`.

## Decide FIRST: should this even BE a workflow?

**Anything that starts from a trigger is a workflow.** A schedule, an event, a webhook, a form submit that kicks off background work: the trigger (a wiring) starts it with `rpc.startWorkflow(name, input)`, never `rpc.invoke`, and the work is its steps (`workflow.do`). Even a single step is a workflow when a trigger starts it. Owners understand "trigger, then steps", and a workflow shows which step failed in Studio's run view, where a queue job hides it. Functions that answer an on-screen request/response (lists, saves, lookups) stay plain functions. Do not move a workflow to a queue worker on your own; if it might be too heavy later, say so in the final message and let the owner decide.

On a schedule: `wireScheduler({ name, schedule: '0 7 * * 1', func: startDigest })` from `#pikku/scheduler`, where `startDigest` is a `pikkuVoidFunc` that only calls `rpc.startWorkflow`. The runtime brings the scheduler service, so never add one to services.ts. A cron has no session: see `pikku-wiring/references/scheduler.md` if a step needs one.

Beyond triggers, the other test: **does any part cross an external boundary that can fail and MUST NOT be lost or double-run** (a payment, a third-party API call, an email/webhook, a wait for approval)? If yes → workflow. **A single algorithm done in one shot, purely local, with no trigger** → a plain `pikkuFunc`; do NOT wrap it in a workflow.

- **Checkout WITH payment → workflow.** Get cart → compute total → **(atomic: create order + items, deduct stock, clear cart)** → **charge through the provider** → send confirmation email. The payment and email are external and must be **retried, not lost, and not charged twice** across a restart, and the user sees where the run is.
- **Checkout with NO external payment** (records the order and decrements stock in one transaction, nothing leaves the process) → a plain `pikkuFunc` wrapping one `kysely.transaction`. It already commits atomically in one shot.
- Also workflows: onboarding sequences, settlements/payouts, digests and batch sends, a weekly report emailed on a schedule, a Slack message on an event, anything that waits (`sleep`/`suspend`) or fans out with retries.

**Atomicity is a TRANSACTION, not a workflow.** All-or-nothing multi-write units belong inside ONE `kysely.transaction(async (trx) => { … })`, in a single step or a single plain `pikkuFunc`, **never split across workflow steps.** A step is a unit of RETRY and REPLAY, not atomicity: pikku opens no transaction around `workflow.do`, so a step that does three writes and throws on the third leaves two committed, and the retry runs them again. Writes are atomic only where YOU opened a transaction, so open one inside the step (use compensating/saga steps only for real cross-service rollback). A payment checkout is a workflow whose _atomic DB writes are ONE step opening ONE transaction_, with the charge and email as durable steps around it.

**A retried step re-runs its side effects.** Replay caching covers only steps that returned; a step that failed, or timed out after the provider accepted it, runs again from the top, so a charge, an email or a webhook can fire twice. Durability is at-least-once, not exactly-once. Pass a stable idempotency key the provider deduplicates on, derived from the workflow's own data:

```typescript
await workflow.do('Charge', 'chargePayment', {
  orderId: data.orderId,
  amount: data.amount,
  idempotencyKey: `order-${data.orderId}-charge`,
})
```

`randomUUID()` or `Date.now()` inside the step is a different key per attempt, which is the double-charge. Where the provider has no such header, make the step idempotent: check for the effect first, or record a unique row the second attempt collides with.

## Choosing the right factory

- **`pikkuWorkflowFunc`: the default for all new workflows.** Sequential + conditional logic in DSL mode (serialisable, replay-safe), with step-graph view.
- `pikkuWorkflowGraph`: DAG / fan-out with nodes and typed refs, with step-graph view. ONLY with explicit user approval AND only for a genuine cyclic dependency or Node.js-only import the DSL cannot express.
- `pikkuWorkflowComplexFunc`: arbitrary TypeScript, no top-level restriction (e.g. dynamic inline functions the DSL extractor cannot handle), but loses the step-graph view. ONLY with explicit user approval, a last resort.

Never switch to either just to dodge a PKU641 error; restructure the code.

### PKU641: DSL static analysis error

`pikkuWorkflowFunc` statically analyzes the body: **every `const`/`let` must be top-level, not inside any block (`if`, `for`, `while`, …).** Assignments inside blocks are fine.

```typescript
// ❌ PKU641
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
// CORRECT: factories come from the generated types file
import {
  pikkuWorkflowFunc,
  pikkuWorkflowGraph,
  pikkuWorkflowComplexFunc,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

// WRONG: the function leaf does not re-export them (TS2305)
import { pikkuWorkflowFunc } from '#pikku/workflow'
```

## Defining a workflow

Declare input/output as Zod schemas, never TypeScript generics (no `pikkuWorkflowFunc<In, Out>(...)`; that skips runtime validation). `data` is typed from the input schema.

```typescript
import { z } from 'zod'
import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const processOrder = pikkuWorkflowFunc({
  description: 'Process an order through payment and fulfillment',
  tags: ['orders'],
  input: z.object({ orderId: z.string(), amount: z.number() }),
  output: z.object({ status: z.string() }),
  func: async (services, data, { workflow }) => {
    let status: string // top level, even if only assigned in branches (PKU641)
    const payment = await workflow.do('Charge', 'chargePayment', data)

    if (payment.success) {
      await workflow.do('Fulfill', 'fulfillOrder', { orderId: data.orderId })
      status = 'fulfilled'
    } else {
      status = 'payment-failed'
    }
    return { status }
  },
})
```

### Workflow step types

```typescript
// RPC step (opts: retries, retryDelay, description)
const result = await workflow.do('Step name', 'rpcFunctionName', { ...data }, { retries: 3, retryDelay: '1s' })

// Sub-workflow step: name a workflow instead of an RPC
const onboarded = await workflow.do('Onboard', 'onboardUserWorkflow', { userId })

// Inline closure step: immediate execution, cached for replay
const msg = await workflow.do('Generate', async () => `Welcome, ${data.email}!`)

// Sleep: durable pause (duration: '30s', '5min', '1h', '1d')
await workflow.sleep('Wait 5 minutes', '5min')

// Suspend: pause until externally resumed, then continue
await workflow.suspend('Awaiting approval')

// Approval: suspend for a human decision and resume with the answer
await workflow.approval('Manager sign-off', { ... })
```

`workflow.name`, `workflow.runId` and `await workflow.getRun()` identify the current run. Full step options: `description`, `retries`, `retryDelay`, `compensate: false` (plus `virtualUser`, scenario-only; see `pikku-scenario`).

### Approval gates: who may answer

`workflow.approval(reason, options)` takes a `schema` (a runtime value: the payload comes from an untrusted caller, so a type generic would validate nothing), an optional `expiry`, and an optional policy for **who** may answer:

```typescript
const signOff = await workflow.approval('Manager sign-off', {
  schema: SignOffSchema,
  expiry: '3d',
  approvers: 'not-initiator',      // four-eyes
  approverScope: 'payments:approve', // and they must hold this scope
})
if (signOff.status === 'expired') { ... }
```

`approvers`:

- `any` (default): anyone the approve entrypoint admits. The gate is a pause for a decision, not an authorization boundary.
- `owner`: only the user who started the run.
- `not-initiator`: anyone **except** the user who started the run.

A rejected decision is refused with a 403 if the run has reached the gate, or discarded on replay (gate re-closed, silently) if it arrived earlier. Both are audited. A gate declaring neither option accepts anyone the approve route lets through; gate the route with `auth`/`permissions` to narrow that.

Two-phase enforcement detail, `decidedBy`/`decidedAt` provenance and the `workflow.approval.decided` audit record: `references/workflow-reference.md`.

### Failure: `compensate`, never try/catch

**Do not wrap steps in try/catch.** The DSL extractor serialises the body into a step graph and cannot represent a `catch`, so the graph would no longer describe what runs. This is settled design, not a temporary limitation.

Declare how a function is undone **on the function itself**. When a later step fails (after retries), the engine runs the `compensate` of every earlier completed step, newest first, then the failed step's own:

```typescript
export const chargePayment = pikkuFunc({
  func: async ({ payments }, { orderId }) => payments.charge(orderId),
  compensate: async ({ payments }, { orderId }, { workflow }) => {
    const { ok, output } = workflow!.compensatingFor!
    // ok: false → the charge itself failed; output is null, `error` is set
    if (ok) await payments.refund(output.chargeId)
  },
})
```

- `compensate` gets the **same input** as the forward call. `wire.workflow.compensatingFor` is `{ ok: true, output, stepName }` or `{ ok: false, output: null, error, stepName }`.
- It is never callable over HTTP, MCP or RPC. Only the engine runs it, as the durable step `<step>:compensate` with the same retry defaults as forward steps.
- Opt a call site out with `{ compensate: false }` (graph nodes likewise).
- A run ends `compensated` (everything undone), `compensation_failed` (a compensation ran out of retries; `stuckSteps` names them; steps before a stuck one are not undone, parallel siblings still are) or `failed` (nothing needed undoing).
- `await workflow.milestone('paid')` bounds the unwind: steps finished before the last milestone are kept, and the run ends `compensated` with `restedAt: 'paid'`.
- A failing child workflow unwinds itself first; a stuck child makes the parent `compensation_failed`. Cancelling a run (`cancelRun`) unwinds it the same way, children first.

To **recover** instead of undo, use a graph node's `recover: 'nodeId' | ['a','b'] | 'ignore'`. The failure routes to those nodes (`'ignore'` continues to `next` with a null output) and the failing step is not compensated. The error arrives as `wire.graph.recoveringFrom` (`{ nodeId, stepName, error }`). The DSL has no recovery: branch on a result object (`{ success: false, reason }`).

### Parallel fan-out

```typescript
const users = await Promise.all(
  data.userIds.map((userId) =>
    workflow.do(`Fetch user ${userId}`, 'getUser', { userId })
  )
)
```

### Sub-workflows

A `workflow.do` whose second argument names a **workflow** starts it as a child run and resolves to its output. There is no separate API; the generated `TypedWorkflow` has an overload keyed on `FlattenedWorkflowMap`, so child input and output are type-checked like an RPC step's.

- **Its own run:** own `runId`, steps and history. The parent step records `childRunId`; the child's wire carries `parentRunId`/`parentStepId`. Inspect the child's steps on the child run.
- **Identity is inherited:** the child's wire copies the parent's `pikkuUserId`, so it runs as whoever started the parent.
- **Inline vs queued follows the deployment.** Without a `queueService` the child runs inline and the parent step returns its output. With one, the child is queued, the parent parks on that step, and the child's completion writes the step's result and resumes the parent.
- **Failure propagates.** A child that fails or is cancelled fails the parent step (`'Sub-workflow failed'` / `'Sub-workflow was cancelled'` when the child left no message). Inline, the step's `retries` start a fresh child run per attempt; queued, the failure lands once and is not retried, so put retries on the child's own steps.

Use a sub-workflow when the child is a real orchestration you also start on its own or reuse from several parents. A child that would be a single `workflow.do` is a function: call the RPC directly.

To start a workflow **without waiting**, have an RPC step call `rpc.startWorkflow(name, input)`, which returns `{ runId }` immediately; the new run has no parent link.

### Graph workflow (DAG)

`pikkuWorkflowGraph` derives types from the RPC map, with no explicit `input`/`output`. Nodes map `nodeName → Pikku function name`, or a workflow name (a sub-workflow node); `config.<node>.next` lists nodes to run after it, in parallel; `config.<node>.input: (ref) => ...` transforms input using refs to prior node outputs.

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

Per-step inline-vs-queue dispatch (`workflowQueued: true`, `dispatchStep`), manual HTTP wiring and a suspend/resume example: `references/workflow-reference.md`.
