---
type: decision
title: pikku persona run with skip-role-check runs a persona whose roles were never verified
description: The persona run command takes a skipRoleCheck option, and when it is set the roles are not read back or compared before the first step
tags: cli, personas, roles, scenarios
---

# pikku persona run with skip-role-check runs a persona whose roles were never verified

`packages/cli/src/functions/commands/persona.ts` takes `skipRoleCheck` (`persona.ts:80`) and passes it through
(`persona.ts:99`). The check runs before the first step, and the comment gives the reason: findings from a persona
whose roles drifted are about the seed, not the product. The comment also says the skip exists for a stage whose auth
reports roles somewhere the CLI cannot read (`persona.ts:221-224`).

The check is inside `if (!skipRoleCheck)` (`persona.ts:225`). Inside it, a null read logs a warning that the run is
unverified (`persona.ts:226-231`). With the skip set, neither the read nor the warning happens.

**What this rules out:** treating a skipped run as checked. The drift refusal for a persona whose roles differ from the declaration, covered in
`packages/core/knowledge/decisions/security/a-persona-whose-roles-drift-from-the-declaration-refuses-to-run.md`, is what this skips.
