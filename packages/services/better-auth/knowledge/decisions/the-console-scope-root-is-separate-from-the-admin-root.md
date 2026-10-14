---
type: decision
title: The console scope root is separate from the admin root
description: auth-scopes.ts declares the console's own root, pikku:console, beside admin, so holding the admin grant never opens the console
tags: better-auth, scopes, console
---

# The console scope root is separate from the admin root

`packages/services/better-auth/src/auth-scopes.ts` declares two roots:

- `ADMIN_SCOPE_ROOT = 'admin'` (`auth-scopes.ts:17`). Every scope in `ADMIN_SCOPES`
  hangs off it, so one `admin` grant covers the set (`auth-scopes.ts:6-15`).
- `CONSOLE_SCOPE_ROOT = 'pikku:console'` (`auth-scopes.ts:26`). The comment above it
  (`auth-scopes.ts:19-25`) says it is a separate tree on purpose. Administering the
  application and being allowed to open the console are different questions, so
  holding one never implies the other. Anything that wants both has to grant both.

`ADMIN_SCOPE_TREE` at `auth-scopes.ts:73` declares only the `admin` root, so the
console root does not appear in the tree the admin addon shares
(`packages/addon/pikku-admin/src/scopes.ts`).

**What this rules out:** a console grant implied by `admin`, and an `admin` grant
that opens the console.
