---
type: decision
title: The admin root stays off the addon so each function carries its own scope
description: The admin scope tree in scopes.ts is not declared on the addon's wireAddon, because verifyScopes is a conjunction, and it must match the better-auth copy of the same tree
tags: admin, scopes
---

# The admin root stays off the addon so each function carries its own scope

`packages/addon/pikku-admin/src/scopes.ts:18-90` declares the `admin` tree with
`defineScope`. The file's comment says the tree is deliberately not declared on
this addon's `wireAddon` (`scopes.ts:10-13`). The reason it gives: `verifyScopes`
is a conjunction over the addon's scopes and the function's, so an addon-level
`admin` would force the root on a caller granted only `admin:users:list`, and every
leaf would stop mattering. Each function therefore declares its own leaf. For
example, `list-users.function.ts:64` declares `admin:users:list`, and
`set-user-password.function.ts:10` declares `admin:users:password`.

The same comment says the tree must stay identical to `ADMIN_SCOPE_TREE` in
`@pikku/better-auth` (`scopes.ts:15-16`). That copy is at
`packages/services/better-auth/src/auth-scopes.ts:73`. The two objects were
compared with a whitespace-insensitive diff, and they match.

The comment's claim that pikku rejects differing declarations of a shared root is
the file's own statement. This note did not check that rule in the framework.

**What this rules out:** declaring `admin` on `wireAddon`, and changing one copy of
the tree without the other.
