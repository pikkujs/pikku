---
type: decision
title: The console scope root is separate from the admin root
description: auth-scopes.ts names the console operator root, pikku:console, beside admin, so holding the admin grant never implies it
tags: better-auth, scopes, console
---

# The console scope root is separate from the admin root

`packages/services/better-auth/src/auth-scopes.ts` declares two roots:

- `ADMIN_SCOPE_ROOT = 'admin'` (`auth-scopes.ts:17`). Every scope in `ADMIN_SCOPES`
  hangs off it, so one `admin` grant covers the set (`auth-scopes.ts:6-15`).
- `CONSOLE_SCOPE_ROOT = 'pikku:console'` (`auth-scopes.ts:26`). The comment above it
  (`auth-scopes.ts:19-25`) says it is a separate tree on purpose. Administering the
  application and operating it from Studio are different questions, so
  holding one never implies the other. No package in this repository declares the
  tree; it is named so that operators are told apart from users. Anything that wants both has to grant both.

`ADMIN_SCOPE_TREE` at `auth-scopes.ts:73` declares only the `admin` root, so the
console root does not appear in the tree the admin addon shares
(`packages/addon/pikku-admin/src/scopes.ts`).

**What this rules out:** a console grant implied by `admin`, and an `admin` grant
that implies the console root.
