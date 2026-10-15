---
type: decision
title: A virtual user whose granted roles drift from its declaration refuses to run
description: verifyVirtualUserRoles compares declared and granted roles in both directions before a run, and roleMismatchMessage produces the refusal text; a provider login is never runnable
tags: core, virtual-users, roles, drift
---

# A virtual user whose granted roles drift from its declaration refuses to run

`packages/core/src/wirings/virtual-user/validate-virtual-users.ts` has the role check that
runs before a virtual user's first step. `verifyVirtualUserRoles` computes what is missing
and what is extra, in both directions (`validate-virtual-users.ts:94-111`). `roleMismatchMessage`
returns `null` when they match, and otherwise a message that ends with "Refusing
to run" (`validate-virtual-users.ts:114-133`, the text at `validate-virtual-users.ts:131`).

The doc comment says the declaration is authoritative, but a run may target a
stage that the generated seed never touched (`validate-virtual-users.ts:84-87`). It
gives a reason for each direction: an under-granted virtual user reports seed drift
as an authorization bug, and an over-granted one "silently stops testing the
boundary it was written to test" (`validate-virtual-users.ts:89-92`).

Nothing in `packages/core/src` calls `roleMismatchMessage`. The caller that
stops the run is the `pikku virtual-user` command
(`packages/cli/src/functions/commands/virtual-user.ts`), so this file only
supplies the check and the message.

`isRunnableVirtualUser` (`validate-virtual-users.ts:19-27`) returns false for a virtual user
with `runnable: false`, and for any virtual user with an account provider, because
driving a provider consent screen "needs a human" (`validate-virtual-users.ts:10-12`).

**What this rules out:** running a virtual user whose roles no longer match what
it declared, and a provider-login virtual user being driven by a run.
