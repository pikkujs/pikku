---
name: pikku-workflow
description: >-
  Durable workflows: pikkuWorkflowFunc, workflow.do/sleep/suspend/approval, compensate. For multi-step work and anything a trigger starts (schedule, event, webhook, form submit), even with one step.
installGroups: [core]
---

# Pikku Workflow

What to reach for and why. For how to call it, run this once: `pikku doc workflow pikkuWorkflowFunc TypedWorkflow WorkflowStepOptions WorkflowApprovalOptions WorkflowRunService wireScheduler`. Depth: `references/workflow-reference.md`.

## Is it a workflow?

- **A trigger starts it → workflow, even with one step.** A schedule, event, webhook or form submit that kicks off background work. Owners see "trigger, then steps", and Studio shows which step failed; a queue job hides that. Do not move a workflow to a queue worker on your own.
- **It crosses a boundary that can fail and must not be lost or run twice** (payment, third-party call, email, a wait for a person) → workflow.
- **Someone must approve → `workflow.approval`,** never a status column of your own.
- **On-screen request/response, or one local algorithm → plain function.** Do not wrap it.
- **All-or-nothing writes → one `kysely.transaction`,** in one step or a plain function, never split across steps. A step is a unit of retry, not atomicity: nothing opens a transaction around it.

## Rules

- A retried step re-runs its side effects. Durability is at-least-once, so a charge or email can fire twice. Pass a stable idempotency key built from the workflow's own data (`order-${orderId}-charge`), never `randomUUID()` or `Date.now()`.
- Every step is a pikku function. Input and output are Zod schemas, not generics.
- `pikkuWorkflowFunc` is the default. `pikkuWorkflowGraph` and `pikkuWorkflowComplexFunc` only with the owner's approval, never to dodge an error.
- No try/catch around steps. Declare `compensate` on the function itself; the engine runs it. Use a milestone to bound the unwind.
- A sub-workflow is for a real orchestration you also start on its own. A child that would be one step is a function.
- A trigger never calls `rpc.invoke`, and never adds scheduler or workflow services: `pikku dev`, `pikku serve` and stages bring them.
- Workflows go in `packages/functions/src/wirings/*.workflow.ts`, exported. Start, run and status routes come from `scaffold.workflow`.
- On a schedule, the `wireScheduler` func is a `pikkuVoidFunc` that only starts the workflow, in the workflow's file: `func: async (_services, _input, { rpc }) => { await rpc.startWorkflow('weeklyReport', {}) }`, and `rpc.startWorkflow` is called the same way from a function. A cron has no session.
- An approval takes a real `schema`, and the workflow branches on the result. A no is an answer (`approveStep` with `{ approve: false }`), never `updateRunStatus('cancelled')`, which skips compensation. Waiting approvals come from `WorkflowRunService`, not the `workflowRuns` table.
- `approvers` defaults to `any`, which is not an authorization boundary: set `owner` or `not-initiator` when it matters who decides.
