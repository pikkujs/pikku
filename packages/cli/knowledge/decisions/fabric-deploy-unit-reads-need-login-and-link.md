---
type: decision
title: Fabric deploy-unit reads refuse without a CLI login and a linked project
description: The FabricDeployUnits function throws a precondition error when there is no token or no linked project before it lists workers for a branch
tags: cli, fabric, deploy
---

# Fabric deploy-unit reads refuse without a CLI login and a linked project

`FabricDeployUnits` in `packages/cli/src/fabric/functions/deploy-units.function.ts` lists the
deployed worker units for a branch. It resolves the API context (`deploy-units.function.ts:23`),
then throws `FabricPreconditionError` when there is no token (`deploy-units.function.ts:24-27`)
and again when there is no `projectId` (`deploy-units.function.ts:28-31`). Only after both checks
does it resolve the stage and call `listDeploymentWorkers` (`deploy-units.function.ts:33-35`).

**What this rules out:** reading topology from a checkout that is logged out or not linked to a
Fabric project.
