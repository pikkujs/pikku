---
type: decision
title: The deploy reset flag refuses production and any attached deployment at input validation
description: pikku cloud deploy with reset is checked when the input is parsed, refusing the main branch, production, and a --deployment-id target, and the check runs again once the branch is known
tags: cli, cloud, deploy, reset
---

# The deploy reset flag refuses production and any attached deployment at input validation

`CloudDeployValidatedInput` in `packages/addon/pikku-cloud-cli/src/functions/deploy.function.ts` runs
`assertResetAllowed` when `reset` is set (`deploy.function.ts:53-64`). The validated input is the
one the deploy function takes (`deploy.function.ts:226`).

`assertResetAllowed` in `packages/addon/pikku-cloud-cli/src/lib/deploy-reset.ts` throws when `production` is set
or the branch is `main` (`deploy-reset.ts:11-12`, `deploy-reset.ts:24-28`). It also throws when a
`deploymentId` is given, since reset applies only to a deploy it creates (`deploy-reset.ts:29-34`).
The comment says it runs once on the input and again when the target branch is known
(`deploy-reset.ts:14-18`).

**What this rules out:** a reset against main, and a reset attached to an existing deployment.
