---
type: decision
title: Tenancy is a permission, not a scope
description: Why every read carries an orgId and every function runs two gates
resource: scope:issues:read
tags: [authorization, multi-tenancy]
---

# Tenancy is a permission, not a scope

Every tenant-facing function declares both:

```ts
scopes: ['issues:read'],
permissions: { member: isOrgMember },
```

They answer different questions, and a multi-tenant product needs both answered.

- **Scope** — is this caller the *kind of person* who reads issues? A property
  of the caller alone.
- **Permission** — are these *their organisation's* issues? A property of the
  pair, and therefore not expressible as a scope.

## What each one alone would do

Drop the permission and any customer reads any other customer's backlog by
guessing an `orgId`. Every one of them holds `issues:read` — that is what makes
them a customer.

Drop the scope and there is no way to hand somebody read-only access at all,
because the only remaining gate is membership, which is binary.

## Why `customer` holds so many scopes

`customer` holds `projects`, `issues`, `members:read` and `billing:read` — which
looks alarming until you notice the second gate. Holding `issues:close` means
"may close issues **in organisations they belong to**". Withholding it globally
would mean nobody could ever close anything, because Pikku's scopes are global
and there is no per-tenant scope grant to fall back on.

That is the shape: **global scopes say what the verbs are, membership says which
rows.**

## The filter is not redundant with the permission

`listIssues` also filters `.where('issue.orgId', '=', orgId)`. The permission
decides whether the call may run at all; the filter decides what comes back.
A permission alone returns every organisation's rows to a legitimate member of
one of them.

## Resolve the tenant from the row, not the input

`closeIssue` uses `canWriteIssue`, which finds the organisation from the issue
itself. A caller who sends their own `orgId` alongside somebody else's
`issueId` passes a naive membership check and fails this one.

`createIssue` does the same thing in reverse: it re-reads the project under the
tenant filter rather than trusting that the `projectId` belongs to the `orgId`
it was handed.

## Failing closed

The permissions return `false` for an absent session and an absent membership
row rather than throwing. Throwing on a missing row leaks the difference
between "not yours" and "does not exist", which is how id enumeration finds
real organisations.
