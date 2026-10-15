---
type: decision
title: Virtual user sync provisions only the virtual users the environment rule allows, and keeps runnable false ones
description: pikku virtual-user sync applies the same environment refusal that decides who may run, and lists a runnable false virtual user anyway because its account is the reason it was declared
tags: cli, virtual-users, provisioning, environments
---

# Virtual user sync provisions only the virtual users the environment rule allows, and keeps runnable false ones

`virtualUserSync` in `packages/cli/src/functions/commands/virtual-user-sync.ts` writes nothing.
It runs `virtualUserEnvironmentRefusal` over every declared virtual user (`virtual-user-sync.ts:61-69`).
A virtual user that is refused is added to `skipped` and left out (`virtual-user-sync.ts:70-73`).
Only the rest go into `eligible` and are listed as to be provisioned (`virtual-user-sync.ts:74`, `:90-101`).

The comment gives the reason: the rule that decides who may run against an environment must also decide who is provisioned into it, because two rules would drift (`virtual-user-sync.ts:54-57`).

The loop does not read `runnable`. A `runnable: false` virtual user is still eligible, and the comment says so: its account is the reason it was declared, because other people act on it (`virtual-user-sync.ts:59-60`).

Creating the accounts happens in the deployment, not here. The doc comment says the command used to write through a Kysely connection from the local config, which provisioned the wrong database for every environment but the developer's own (`virtual-user-sync.ts:10-16`). Its closing message tells the reader to hand the generated virtual users to the deployment's auth plugin (`virtual-user-sync.ts:105-107`).

The environment rule itself is described in [a virtual user environment is refused unless the environment is known and allowed](../../../core/knowledge/decisions/security/a-virtual-user-environment-fails-closed.md). The generation-time check is in [a virtual user that cannot run where it says stops generation](virtual-user-environment-errors-stop-generation.md), which does not cover provisioning.

**What this rules out:** provisioning a virtual user into an environment that the refusal rule rejects; and dropping a `runnable: false` virtual user from the provisioning set on the grounds that it cannot sign in.
