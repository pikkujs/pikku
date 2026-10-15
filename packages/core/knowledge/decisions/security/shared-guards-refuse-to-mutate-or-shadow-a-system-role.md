---
type: decision
title: Shared guards refuse to mutate or shadow a system role, in every store
description: system-role-guard holds the guards every ScopeService must call before changing a role, and roleLockReason gives the console a reason to show for a locked role
tags: core, roles, scopes, guards
---

# Shared guards refuse to mutate or shadow a system role, in every store

`packages/core/src/services/system-role-guard.ts` is the shared guard that a
`ScopeService` implementation must apply before it mutates a role. The doc
comment says the rule is "a contract, not a policy", because a store that lets
the console delete a declared role makes virtual user and scenario checks stop testing
what they claim to (`system-role-guard.ts:7-15`).

- `assertRoleIsMutable` throws `SystemRoleImmutableError` when the name is a
  system role (`system-role-guard.ts:27-35`). The caller names the operation in
  the message.
- `assertRoleNameAvailable` throws `SystemRoleShadowedError` when a new custom
  role would take a declared name (`system-role-guard.ts:40-47`).
- `isSystemRole` is passed in, so an implementation can answer from a column, a
  cache or a query (`system-role-guard.ts:17-18`, `20`).

`roleLockReason` (`system-role-guard.ts:56-71`) returns a reason string for a
system role, or `null` when it is editable. A role whose declaration was removed
gets a message that says it is inert and points to `pikku roles prune`
(`system-role-guard.ts:60-66`). The doc comment says a reason is shown "instead
of a disabled button with no explanation" (`system-role-guard.ts:52-54`).

Sibling note: [system roles are synced additively and cannot be deleted or
rewritten](system-roles-are-additive-and-immutable.md).

**What this rules out:** a store deleting, re-scoping or shadowing a declared
role, and a locked role shown without a reason.
