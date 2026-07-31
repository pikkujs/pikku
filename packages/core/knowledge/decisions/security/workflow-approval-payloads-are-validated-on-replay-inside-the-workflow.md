---
type: decision
title: An approval decision is stored raw and validated on replay, and an invalid one closes the gate rather than failing the run
description: The schema only exists inside the workflow body, and letting an external payload fail the run would let any caller kill a workflow
tags: workflow
---

# An approval decision is stored raw and validated on replay, and an invalid one closes the gate rather than failing the run

`approveStep` in `pikku-workflow-service.ts` is called from outside the workflow
— an HTTP route, an RPC — where the approval's schema value is not in scope. It
therefore stores the decision payload raw in run state and does nothing else.
Validation happens on replay inside `approvalStep`, in the workflow body, which
is the only place the schema exists.

When validation fails, the bad decision is dropped, the issues are recorded on
the gate's state record, and a `WorkflowSuspendedException` re-closes the gate.
The failure stays legible to whoever tries next, and — the security point —
failing the run instead would let any caller kill a workflow with a malformed
payload. A later valid decision still lands normally.

`WorkflowApprovalOptions.schema` is a VALUE, not a type generic, for the same
reason: the payload arrives from an untrusted caller over the approve wire, and
a generic is erased at compile time, so it would validate nothing. Any
standard-schema library (zod, valibot, arktype) satisfies it. The contract is
the `~standard` spec and nothing more: `@pikku/core` deliberately carries no
zod dependency, which is why `pikku-workflow-service.test.ts` hand-rolls a
minimal `StandardSchemaV1` rather than importing a validation library.

A decision arriving for a gate that has already resolved is rejected with
`WorkflowApprovalResolvedError` (409) rather than accepted and dropped. The gate
caches its outcome as the step result and never re-reads run state, so a
decision recorded after resolution could not take effect — most obviously when
it loses the race with expiry — and the approver has to be told their decision
did not land.

**What this rules out:** validating in `approveStep` (the schema is not there),
failing the run on an invalid payload, turning `schema` into a type parameter,
accepting a decision on a resolved gate, or making a resolved gate re-read run
state so a late decision "wins".
