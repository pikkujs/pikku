---
type: decision
title: Cancelling is a scope, not a role check
description: Why authorization is declared rather than written in the function body
resource: scope:orders:cancel
tags: [authorization, rbac]
---

# Cancelling is a scope, not a role check

`cancelOrder` used to decide for itself who was allowed to call it:

```ts
if (order.userId !== session.userId && session.role !== 'admin') {
  throw new Error('Forbidden')
}
```

It now declares `scopes: ['orders:cancel']` and
`permissions: { owner: isOrderOwner }` instead.

## What that rules out

- **A role string nobody declared.** `session.role === 'admin'` could not be
  checked at build time. A typo, or a role renamed in the database, failed open
  or closed silently depending on which side of the comparison changed.
- **Granting it without a deploy.** A scope can be attached to a role in the
  console. A string comparison in a function body cannot.
- **Answering "who can cancel an order?" by reading code.** The answer is now
  in the role declaration, and `pikku scopes audit` can find it.

## The part that could not be a scope

Ownership. `orders:cancel` says the caller is the *kind* of person who cancels
orders; it cannot say the order is theirs, because that depends on the row. So
scopes and permissions do different jobs and both run: scopes AND together
first, then permissions OR across keys.

Support holds `orders:cancel` and owns nothing, so it passes on the scope. A
customer owns the order and passes on the permission. Neither needs a branch.
