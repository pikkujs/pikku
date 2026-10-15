---
type: decision
title: pikku virtual-user run with skip-role-check runs a virtual user whose roles were never verified
description: The virtual-user run command takes a skipRoleCheck option, and when it is set the roles are not read back or compared before the first step
tags: cli, virtual-users, roles, scenarios
---

# pikku virtual-user run with skip-role-check runs a virtual user whose roles were never verified

`virtualUserRun` in `packages/cli/src/functions/commands/virtual-user.ts` takes `skipRoleCheck` and passes it
through. The check runs before the first step, and the comment gives the reason: findings from a virtual user
whose roles drifted are about the seed, not the product. The comment also says the skip exists for a stage whose auth
reports roles somewhere the CLI cannot read.

The check is inside `if (!skipRoleCheck)`. Inside it, `sessionRoles()` reads the roles back; a null read logs a
warning that the run is unverified, and a mismatch from `verifyVirtualUserRoles` throws a `PikkuError`. With the skip
set, neither the read nor the warning happens.

**What this rules out:** treating a skipped run as checked. The drift refusal for a virtual user whose roles differ
from the declaration, covered in
[a virtual user whose roles drift from the declaration refuses to run](../../../core/knowledge/decisions/security/a-virtual-user-whose-roles-drift-from-the-declaration-refuses-to-run.md),
is what this skips.
