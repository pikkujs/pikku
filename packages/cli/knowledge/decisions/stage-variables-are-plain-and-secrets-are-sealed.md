---
type: decision
title: Stage variables are sent and read back in plain form, and anything that must not print goes to secrets
description: fabric variables set sends the value unsealed and does not prompt, so a variable can be read back, and the comment directs sensitive values to secrets set
tags: cli, fabric, variables, secrets
---

# Stage variables are sent and read back in plain form, and anything that must not print goes to secrets

`FabricVariablesSet` in `packages/cli/src/fabric/functions/variables-set.function.ts` takes a name, an optional branch and a
value (`variables-set.function.ts:9-13`). Its description says the value is stored in plain form and is readable back
(`variables-set.function.ts:22`).

The comment at `variables-set.function.ts:43-47` says the value is deliberately not sealed and not prompted for. A variable
is configuration, and sealing it would stop it being read back. Anything that would hurt to print belongs in
`pikku fabric secrets set`. The value is sent with `setStageConsoleVariable` after `parseVariableValue`
(`variables-set.function.ts:48-52`).

**What this rules out:** moving a secret into variables. Variables are readable back by design.
