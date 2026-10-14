---
type: decision
title: Agent run grades are readable by the run's owner or the admin root, and a hidden run reads as not found
description: get-agent-run-scores declares no scopes; it checks the admin root or canAccessThread in the body and throws NotFound for both a missing run and a run the caller may not see
tags: console, agents, ownership
---

# Agent run grades are readable by the run's owner or the admin root, and a hidden run reads as not found

`getAgentRunScores` (`packages/addon/pikku-console/src/functions/get-agent-run-scores.function.ts`)
declares no `scopes` key (`get-agent-run-scores.function.ts:8-13`). Its description
says a caller without the admin scope "may only read the grades of runs its own
session owns" (`get-agent-run-scores.function.ts:11`). The gate is in the body.

The function loads the run, then throws `NotFoundError` when the run is missing or
when the caller fails both checks: the caller holds the admin root
(`hasScopes([ADMIN_SCOPE_ROOT], session?.scopes)`, `get-agent-run-scores.function.ts:23`)
and the caller can access the run's thread (`canAccessThread(run.resourceId, session)`,
`get-agent-run-scores.function.ts:24`). Both cases produce the same error text
(`get-agent-run-scores.function.ts:26`).

The comment gives the reason for the not-found answer: a forbidden reply "confirms
the id exists" (`get-agent-run-scores.function.ts:16-20`). Grades come back only
after this gate (`get-agent-run-scores.function.ts:29`).

The admin-root bypass on line 23 is the same bypass that
`questions/should-an-admin-root-skip-the-thread-ownership-check.md` asks about for
the single-thread check. That question does not settle it for this function.

**What this rules out:** answering "forbidden" for a run the caller cannot see, and
relying on a scope to gate this function, since none is declared.
