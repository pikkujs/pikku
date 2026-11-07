---
name: pikku-workflow
description: >-
  Durable workflows: pikkuWorkflowFunc, workflow.do/sleep/suspend/approval, compensate. For multi-step work and anything a trigger starts (schedule, event, webhook, form submit), even with one step.
installGroups: [core]
---

# Pikku Workflow

What to reach for and why. For how to call it, run this once: `pikku doc workflow pikkuWorkflowFunc TypedWorkflow wireScheduler`. Depth: `references/workflow-reference.md`.

## Is it a workflow?

- **A trigger starts it → workflow, even with one step.** A schedule, event, webhook or form submit that kicks off background work. Owners see "trigger, then steps", and Studio shows which step failed; a queue job hides that. Do not move a workflow to a queue worker on your own.
- **It crosses a boundary that can fail and must not be lost or run twice** (payment, third-party call, email, a wait for a person) → workflow.
- **Someone must approve → `workflow.approval`,** never a status column of your own.
- **On-screen request/response, or one local algorithm → plain function.** Do not wrap it.
- **All-or-nothing writes → one `kysely.transaction`,** in one step or a plain function, never split across steps. A step is a unit of retry, not atomicity: nothing opens a transaction around it.

## Rules

- A retried step re-runs its side effects, and a run recovered after a crash re-runs the step caught in flight. Durability is at-least-once, so a charge or email can fire twice. Pass a stable idempotency key built from the workflow's own data (`order-${orderId}-charge`), never `randomUUID()` or `Date.now()`.
- Every step is a pikku function. Input and output are Zod schemas, not generics.
- `pikkuWorkflowFunc` is the default. `pikkuWorkflowGraph` and `pikkuWorkflowComplexFunc` only with the owner's approval, never to dodge an error.
- No try/catch around steps. Declare `compensate` on the function itself; the engine runs it. Use a milestone to bound the unwind. An expected failure (a quote provider with no price) is not that: return a structured outcome from the step and let the workflow branch to a fallback. Compensation is for failures that should unwind the run.
- A sub-workflow is for a real orchestration you also start on its own. A child that would be one step is a function.
- A schedule or other trigger has no signed-in user, so the run has no session: its steps are `pikkuSessionlessFunc`. A `pikkuFunc` step fails at run time, and `pikku validate` won't say so.
- A trigger never calls `rpc.invoke`, and never adds scheduler or workflow services: `pikku dev`, `pikku serve` and stages bring them. A custom host provides `workflowService` in its singleton services before a trigger calls `rpc.startWorkflow`, and a scheduled trigger also needs a scheduler or platform cron.
- Workflows go in `packages/functions/src/wirings/*.workflow.ts`, exported. Start, run and status routes come from `scaffold.workflow`.
- On a schedule, the `wireScheduler` func is a `pikkuVoidFunc` that only starts the workflow, in the workflow's file: `func: async (_services, _input, { rpc }) => { await rpc.startWorkflow('weeklyReport', {}) }`, and `rpc.startWorkflow` is called the same way from a function. A cron has no session.
- An approval takes a real `schema`, and the workflow branches on the result. A no is an answer (`approveStep` with `{ approve: false }`), never `updateRunStatus('cancelled')`, which skips compensation. Waiting approvals come from `WorkflowRunService`, not the `workflowRuns` table.
- `approvers` defaults to `any`, which is not an authorization boundary: set `owner` or `not-initiator` when it matters who decides. `not-initiator` only excludes the starter: any other signed-in user passes, whatever their role. To limit the decision to a group, add `approverScope` or equivalent route permissions.

## A scheduled report, whole

The whole shape, so write it rather than look for one to copy. Steps go in `packages/functions/src/functions/<area>/*.function.ts`, one file each, with the columns from `pikku meta db <table>` and the email from the pikku-emails skill.

```ts
// packages/functions/src/wirings/weekly-report.workflow.ts
export const weeklyReport = pikkuWorkflowFunc({
  input: z.object({ teamId: z.string() }),
  output: z.object({ sent: z.number() }),
  func: async (_services, data, { workflow }) => {
    const report = await workflow.do('Count the week', 'countWeek', data)
    return await workflow.do('Email the figures', 'sendWeeklyReport', report)
  },
})

export const startWeeklyReports = pikkuVoidFunc({
  func: async ({ kysely }, _input, { rpc }) => {
    const teams = await kysely.selectFrom('team').select('teamId').execute()
    for (const { teamId } of teams) await rpc.startWorkflow('weeklyReport', { teamId })
  },
})

wireScheduler({ name: 'weeklyReport', schedule: '0 6 * * 1', func: startWeeklyReports })
```

```ts
// A step: counts or sends, and takes everything it needs as input.
export const sendWeeklyReport = pikkuSessionlessFunc({
  input: WeekReport,
  output: z.object({ sent: z.number() }),
  func: async ({ emailService }, report) => {
    await emailService.send({
      to: report.email,
      template: { name: 'weekly-report', locale: report.locale, data: { count: report.count } },
    })
    return { sent: 1 }
  },
})
```

## An approval, whole

Four pieces: the workflow with its gate, a function that starts it, one that lists what waits, and one that answers. The gate's `reason` is one exported constant, because the answer must name the same gate or it lands on nothing.

```ts
// packages/functions/src/wirings/expense-approval.workflow.ts
export const EXPENSE_APPROVAL = 'A manager approves the expense'
export const ExpenseDecision = z.object({ approve: z.boolean() })

export const expenseApproval = pikkuWorkflowFunc({
  input: z.object({ expenseId: z.string(), teamId: z.string() }),
  output: z.object({ approved: z.boolean() }),
  func: async (_services, data, { workflow }) => {
    const decision = await workflow.approval(EXPENSE_APPROVAL, {
      schema: ExpenseDecision,
      approvers: 'not-initiator',
      expiry: '7d',
    })
    if (decision.status === 'expired' || !decision.data.approve) return { approved: false }
    await workflow.do('Mark the expense approved', 'markExpenseApproved', data)
    return { approved: true }
  },
})
```

```ts
// Start: a pikkuFunc the screen calls. `rpc.startWorkflow` returns { runId }.
const { runId } = await rpc.startWorkflow('expenseApproval', { expenseId, teamId })

// List: a run at a gate is `suspended`. `limit` applies before your team filter, so page through
// every suspended run (or use a team-filtered query) rather than reading only the first 50.
const runs = await workflowRunService.listRuns({ workflowName: 'expenseApproval', status: 'suspended', limit: 50 })
const waiting = runs.filter((run) => (run.input as { teamId?: string }).teamId === teamId)

// Answer: your own pikkuFunc with the project's permission, so the rule of who decides is yours.
// Check the run belongs to the caller first, then:
await workflowService.approveStep(runId, EXPENSE_APPROVAL, { approve }, session)
```

`workflowRunService` and `workflowService` are optional services: check them and throw `MissingServiceError` when absent. The generated `/workflow/<name>/approve/:runId` route only knows `approvers` and `approverScope`; a rule the project already writes as a permission belongs in the answering function. The scaffolded route does not run that function's permission or ownership check, so any signed-in user can approve through it: protect or disable the scaffolded approve route, and use `approverScope` only when it enforces the same policy, including any run-ownership check.
