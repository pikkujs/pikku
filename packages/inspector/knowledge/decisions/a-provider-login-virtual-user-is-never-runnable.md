---
type: decision
title: A provider-login virtual user is never runnable, even when declared runnable
description: Runnable is derived from the account, so a virtual user with a provider login cannot be driven, and an explicit runnable true does not change that
tags: [inspector, virtual-users]
---

# A provider-login virtual user is never runnable, even when declared runnable

`addVirtualUsers` in `packages/inspector/src/add/add-virtual-users.ts` sets `runnable`
through `isRunnableVirtualUser`, passing the declared `runnable` value and the account
(lines 242-256). It imports the function from `@pikku/core/virtual-user` (line 3).

The function is in `packages/core/src/wirings/virtual-user/validate-virtual-users.ts`.
An explicit `runnable: false` gives false (lines 23-25). Otherwise the result is
`account?.provider === undefined` (line 26). A declared `runnable: true` does not
override the provider check, so a provider account is never runnable.
`packages/core/src/wirings/virtual-user/virtual-user-declaration.test.ts:89-90` covers
the provider case.

The doc comment gives the reason (`validate-virtual-users.ts:7-18`). Driving a
provider's consent screen needs a human, so runnability is derived from the account
rather than asked for: "a flag someone must remember to set is a flag that ships
wrong". An explicit `false` marks a person who is only ever acted upon.

**What this rules out:** a provider-login virtual user being driven by a run,
whatever the declaration says.
