---
type: decision
title: A virtual user scaffold refuses to generate when no personas are declared
description: With scaffold.virtualUser enabled, codegen throws instead of emitting virtual-user RPCs, because a virtual user runs as a persona and an empty persona set has nobody to run
tags: cli, virtual-user, personas, codegen
---

# A virtual user scaffold refuses to generate when no personas are declared

`pikkuVirtualUserFunctions` in `packages/cli/src/functions/wirings/virtual-user/pikku-command-virtual-user-functions.ts` returns early and skips the scaffold when `scaffold.virtualUser` or its file paths are unset (`pikku-command-virtual-user-functions.ts:10-21`).

When the scaffold is enabled, it reads the inspected personas. If there are none, it throws (`pikku-command-virtual-user-functions.ts:25-36`). The comment gives the reason: a virtual user is a persona, so the generated functions would have no possible answer except "unknown persona" (`pikku-command-virtual-user-functions.ts:25-28`). The error text names both fixes: declare a persona with `definePersonas`, or remove `scaffold.virtualUser` (`pikku-command-virtual-user-functions.ts:33-35`).

The rule is the same one the persona generator applies to a persona that cannot run where it says, which stops generation before anything is written ([a persona that cannot run where it says stops generation](persona-environment-errors-stop-generation.md)).

**What this rules out:** emitting virtual-user functions and their schemas when no persona exists to sign in as, and treating an enabled scaffold with an empty persona set as a silent no-op.
