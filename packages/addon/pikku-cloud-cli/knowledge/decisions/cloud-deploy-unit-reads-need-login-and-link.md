---
type: decision
title: Cloud deploy-unit reads refuse without a CLI login and a linked project
description: The CloudDeployUnits function throws a precondition error when there is no token or no linked project before it lists workers for a branch
tags: cli, cloud, deploy
---

# Cloud deploy-unit reads refuse without a CLI login and a linked project

`CloudDeployUnits` in `packages/addon/pikku-cloud-cli/src/functions/deploy-units.function.ts` lists the
deployed worker units for a branch. It resolves the API context (`deploy-units.function.ts:23`),
then throws `CloudPreconditionError` when there is no token (`deploy-units.function.ts:24-27`)
and again when there is no `projectId` (`deploy-units.function.ts:28-31`). Only after both checks
does it resolve the stage and call `listDeploymentWorkers` (`deploy-units.function.ts:33-35`).

**What this rules out:** reading topology from a checkout that is logged out or not linked to a
Pikku Studio Cloud project.
