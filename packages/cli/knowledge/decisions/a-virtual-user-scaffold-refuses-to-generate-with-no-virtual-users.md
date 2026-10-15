---
type: decision
title: A virtual user scaffold refuses to generate when no virtual users are declared
description: With scaffold.virtualUser enabled, codegen throws instead of emitting virtual-user RPCs, because the generated functions sign in as a declared virtual user and an empty set has nobody to run
tags: cli, virtual-user, codegen
---

# A virtual user scaffold refuses to generate when no virtual users are declared

`pikkuVirtualUserFunctions` in `packages/cli/src/functions/wirings/virtual-user/pikku-command-virtual-user-functions.ts` returns early and skips the scaffold when `scaffold.virtualUser` or its file paths are unset.

When the scaffold is enabled, it reads the inspected virtual users. If there are none, it throws. The comment gives the reason: the generated functions sign in as a declared virtual user and run as them, so with none declared they would have no possible answer except "unknown virtual user". The error text names both fixes: declare one with `defineVirtualUsers`, or remove `scaffold.virtualUser`.

The rule is the same one the virtual users generator applies to a virtual user that cannot run where it says, which stops generation before anything is written ([a virtual user that cannot run where it says stops generation](virtual-user-environment-errors-stop-generation.md)).

**What this rules out:** emitting virtual-user functions and their schemas when no virtual user exists to sign in as, and treating an enabled scaffold with an empty set as a silent no-op.
