---
type: decision
title: An admin cannot remove their own account
description: remove-user refuses a request whose userId is the caller's own before deleting, under admin:users:remove, and the delete also clears sessions and linked accounts
tags: admin, users, self-removal
---

# An admin cannot remove their own account

`packages/addon/pikku-admin/src/functions/remove-user.function.ts` declares
`scopes: ['admin:users:remove']` (`remove-user.function.ts:10`). Its description
says the delete takes sessions and linked accounts with it, and cannot be undone
(`remove-user.function.ts:8`).

Before deleting, the function compares the target with the caller. If `userId`
equals `session?.userId`, it throws `You cannot delete yourself`
(`remove-user.function.ts:14-15`). Only then does it call `deleteAuthUser(auth,
userId)` (`remove-user.function.ts:17`).

The ban function has a similar self-targeting refusal, which applies only to a ban
and not to lifting one. That is recorded in the question note
`why-does-an-admins-own-ban-throw-while-lifting-one-does-not.md`. This note did not
check `deleteAuthUser` itself for a further guard.

**What this rules out:** an admin deleting their own account through this function.
