---
type: decision
title: Thread run listings filter other owners' runs out instead of refusing, and the admin root sees all
description: get-agent-thread-runs returns every run to the admin root and filters the rest by canAccessThread, so an empty list never confirms that another owner's thread exists
tags: console, agents, ownership
---

# Thread run listings filter other owners' runs out instead of refusing, and the admin root sees all

`getAgentThreadRuns` (`packages/addon/pikku-console/src/functions/get-agent-thread-runs.function.ts`)
is gated by `pikku:console:agents:read` (`get-agent-thread-runs.function.ts:12`).
Its description says a caller without the admin scope "sees only the runs its own
session owns" (`get-agent-thread-runs.function.ts:10`).

The body loads all runs for the thread (`get-agent-thread-runs.function.ts:14`).
A session holding the admin scope root gets the full list back
(`get-agent-thread-runs.function.ts:15-16`). Every other caller gets
`runs.filter((run) => canAccessThread(run.resourceId, session))`
(`get-agent-thread-runs.function.ts:22`).

The comment gives the reason for filtering rather than refusing. A run names the
model, the tools it reached for and why it failed, so it follows the thread's
ownership. An empty list is also what a thread with no runs returns, so the answer
never confirms that someone else's thread exists (`get-agent-thread-runs.function.ts:18-21`).

The admin-root bypass on line 15 is the list-form of the bypass questioned in
`questions/should-an-admin-root-skip-the-thread-ownership-check.md`. That question
concerns the single-thread ownership check, not this list.

**What this rules out:** throwing a forbidden or not-found error for a thread the
caller does not own, since that would tell the caller whether the thread exists.
