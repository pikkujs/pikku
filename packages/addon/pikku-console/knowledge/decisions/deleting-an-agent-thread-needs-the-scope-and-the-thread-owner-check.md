---
type: decision
title: Deleting an agent thread needs the agents:manage scope and the thread owner check, which only the admin root skips
description: deleteAgentThread declares the console agents:manage scope and an owner permission, so holding the scope alone does not let a caller delete someone else's thread
tags: console, agents, permissions, scopes
---

# Deleting an agent thread needs the agents:manage scope and the thread owner check, which only the admin root skips

`deleteAgentThread` declares `scopes: ['pikku:console:agents:manage']` (`packages/addon/pikku-console/src/functions/delete-agent-thread.function.ts:12`) and `permissions: { owner: isThreadOwner }` (`:13`). Its description says a caller without the admin scope may delete only a thread its own session owns (`:10`).

The core rule is that scopes are checked by `runPikkuFunc` before permissions, and every declared scope must be held. Permissions are OR-combined (`packages/core/knowledge/decisions/internals/core-scopes-are-an-and-gate-separate-from-permissions.md`). With one permission declared, `owner` must pass as well.

`isThreadOwner` returns `true` for a session holding the `admin` root before it loads the thread (`packages/addon/pikku-console/src/functions/is-thread-owner.permission.ts:18-19`). Otherwise it loads the thread, returns `false` when it is missing (`:21-22`), and returns `canAccessThread(thread.resourceId, session)` (`:23`).

Whether that admin bypass should apply to single-thread reads is an [open question](../questions/should-an-admin-root-skip-the-thread-ownership-check.md).

**What this rules out:** deleting a thread on the `agents:manage` scope alone, and removing `isThreadOwner` from this function.
