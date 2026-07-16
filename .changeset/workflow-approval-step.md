---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/cloudflare': patch
---

Add `workflow.approval()` — a return-valued, expiring human-in-the-loop gate.

`workflow.suspend(reason)` is a one-shot gate: it marks its own step succeeded before throwing, so
any resume walks straight past it. That makes approve-vs-deny impossible to express, and every
approval flow in the repo is hand-rolled from `do` + `sleep`.

`workflow.approval(reason, { schema, expiry })` stays closed until a decision is recorded against it
and hands that decision back:

```ts
const decision = await workflow.approval('Approve invoice', {
  schema: ApprovalDecision, // any standard-schema value (zod, valibot, arktype)
  expiry: '3d',
})
if (decision.status === 'expired') return { skipped: true }
```

Decisions are recorded with `workflowService.approveStep(runId, reason, decision)`, or over the
generated `POST /workflow/:workflowName/approve/:runId` route. Approver identity is not modelled —
gate that route with your own auth to control who may approve.

Notes:

- The payload is validated on replay inside the workflow body — the only place the schema value is in
  scope — so an invalid decision re-closes the gate rather than failing the run.
- Expiry is evaluated against a recorded deadline, not by a timer firing, so a duplicate, late, or
  dropped wake-up all produce the same answer.
- Approval state lives in the existing run-state blob; no schema migration.
- Assignee, notification medium, reminders, and escalation are deliberately app code, not framework
  surface.
