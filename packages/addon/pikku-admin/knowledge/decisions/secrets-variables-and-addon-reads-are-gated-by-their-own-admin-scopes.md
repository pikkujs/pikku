---
type: decision
title: Secrets, variables and the addon reads carry their own admin scopes, and the session-only reads declare none
description: variableGet and variableSet are gated by admin:variables:read and write, getInstalledAddons and getAddonInstances by admin:addons:read, while getScorers and getMyAccess declare no scope and rely on the session requirement
tags: admin, scopes, variables, addons, sessions
---

# Secrets, variables and the addon reads carry their own admin scopes, and the session-only reads declare none

Nine functions moved here from `@pikku/addon-console`. Each keeps the gate it had; only
the scope id changed, from the `pikku:console` tree to the `admin` tree declared in
`src/scopes.ts` (and mirrored by `ADMIN_SCOPE_TREE` in `@pikku/better-auth`).

| Function | Old scope | New scope |
| --- | --- | --- |
| `secretGet`, `secretHas` | `pikku:console:secrets:read` | `admin:secrets:read` |
| `secretSet` | `pikku:console:secrets:write` | `admin:secrets:write` |
| `variableGet` | `pikku:console:variables:read` | `admin:variables:read` |
| `variableSet` | `pikku:console:variables:write` | `admin:variables:write` |
| `getInstalledAddons`, `getAddonInstances` | `pikku:console:addons:read` | `admin:addons:read` |
| `getScorers`, `getMyAccess` | none | none |

Each leaf is its own grant, so reading a variable does not admit writing one, and a
secrets grant does not admit variables. A single `admin` grant covers all of them.

`getMyAccess` returns only the caller's own `userId` and `scopes`, read from the session
(`session?.userId ?? ''`, `session?.scopes ?? []`). Nothing in its input names another
principal, so a caller can see only their own session. It declares no scope on purpose:
a UI needs it to learn what to render, before it knows what it may call. Its gate is the
session requirement of `pikkuFunc`. See the open question
[getMyAccess without a scope](../questions/should-get-my-access-be-open-to-any-session-or-declare-a-scope.md).

`getScorers` also declares no scope. It lists scorer declarations from the `agent` meta
in `pikkuState` and the names of the agents that use them; it reads no run, thread or
score row.

`getInstalledAddons` reads the host's optional `metaService` only for an addon's icon,
and returns no icon when the host supplied none. The host's `variables` and `secrets` are
forwarded the same way and constructed by nothing here.

**What this rules out:** a function here that grants variable or addon access under a
secrets scope, and a `getMyAccess` that accepts a user id to look up.
