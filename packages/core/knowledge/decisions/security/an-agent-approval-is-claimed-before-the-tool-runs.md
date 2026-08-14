---
type: decision
title: An agent approval is claimed before the tool runs
description: resolveApproval is a compare-and-swap returning whether this caller won, because the read that precedes it is not a claim and ten concurrent approvals would otherwise mean ten refunds
tags: agent
---

# An agent approval is claimed before the tool runs

Resuming a suspended agent run read the run, checked `status === 'suspended'`,
snapshotted `pendingApprovals`, called `resolveApproval`, executed the tool, and
only then wrote `status: 'running'`. Nothing spanned that sequence — no
transaction, no row lock, no conditional update — so concurrent approvals of the
same tool call all observed `suspended`, all snapshotted the same list, and all
reached `execute`. `resolveApproval` returned `void`, so a loser could not even
tell.

`resolveApproval` is now the claim, and returns whether _this_ caller made it.
The stores implement it as a compare-and-swap: Kysely updates the run row only
while `status = 'suspended'` and `pendingApprovals` still equals the list it
read; the tool-call stores move the row off `approvalStatus = 'pending'` and
count the rows they changed. Both resume paths run the tool only for the ids they
claimed, and a caller that claimed nothing gets an error rather than a silent
re-run.

The claim is per tool call, not per run, so concurrent approvals of _different_
tool calls on one run all proceed — which is the case that made a run-level
`claimSuspendedRun` the worse fit.

**What this rules out:** treating `getRun` as a claim, adding a resume path that
executes a tool without a `true` from `resolveApproval`, and implementing
`resolveApproval` as a read-modify-write in any new store — the return value is
a promise about atomicity, not a convenience.
