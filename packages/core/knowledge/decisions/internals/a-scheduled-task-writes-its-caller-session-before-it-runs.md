---
type: decision
title: A scheduled task writes its caller's session to the session store before it runs
description: runScheduledTask stores the session it is passed, or nothing, before it looks up the task, so the run uses only a session its caller supplied
tags: core, scheduler, sessions
---

# A scheduled task writes its caller's session to the session store before it runs

`runScheduledTask` in `packages/core/src/wirings/scheduler/scheduler-runner.ts:70-87`
takes an optional `session`. It builds a `PikkuSessionService` on the session store
(`:84`), and when a session was passed it calls `userSession.set(session)` (`:85-87`).
Nothing else in the function sets a session. The task and its meta are looked up
afterwards (`:89-96`), so a missing task still leaves the session written.

The in-repo caller of this path, `packages/schedule/src/in-memory-scheduler-service.ts:163`,
passes only `{ name }`, so a cron run has no session.

**What this rules out:** a scheduled run taking a session from anywhere other than
its caller, and any default system session being set by this function.
`questions/does-a-delayed-rpc-run-as-the-session-it-was-scheduled-with.md` records a
related gap in the delayed-RPC path.
