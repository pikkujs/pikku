---
type: decision
title: Persona sync provisions only the personas the environment rule allows, and keeps runnable false ones
description: pikku persona sync applies the same environment refusal that decides who may run, and provisions a runnable false persona anyway because its account is the reason it was declared
tags: cli, personas, provisioning, environments
---

# Persona sync provisions only the personas the environment rule allows, and keeps runnable false ones

`personaSync` in `packages/cli/src/functions/commands/persona-sync.ts` writes nothing.
It runs `personaEnvironmentRefusal` over every declared persona (`persona-sync.ts:61-69`).
A persona that is refused is added to `skipped` and left out (`persona-sync.ts:70-73`).
Only the rest go into `eligible` and are listed as to be provisioned (`persona-sync.ts:74`, `:90-101`).
The comment gives the reason: the rule that decides who may run against an environment must also decide who is provisioned into it, because two rules would drift (`persona-sync.ts:54-57`).

The loop does not read `runnable`. A `runnable: false` persona is still eligible, and the comment says so: its account is the reason it was declared, because other people act on it (`persona-sync.ts:59-60`).

Creating the accounts happens in the deployment, not here. The command tells the operator to pass the generated personas to `pikkuFabric` (`persona-sync.ts:18-21`, `:105-107`).

The environment rule itself is described in [a persona environment is refused unless the environment is known and allowed](../../../core/knowledge/decisions/security/a-persona-environment-fails-closed.md). The generation-time check is in [a persona that cannot run where it says stops generation](persona-environment-errors-stop-generation.md), which does not cover provisioning.

**What this rules out:** provisioning a persona into an environment that the refusal rule rejects; and dropping a `runnable: false` persona from the provisioning set on the grounds that it cannot sign in.
