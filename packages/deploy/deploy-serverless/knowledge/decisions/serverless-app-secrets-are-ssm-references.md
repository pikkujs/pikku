---
type: decision
title: Serverless deploys reference app secrets as SSM parameter paths, never as inline values
description: serverless.yml reads each secret from an SSM parameter named by project and stage, so no secret value is written into the file
tags: [deploy, serverless, secrets]
---

# Serverless deploys reference app secrets as SSM parameter paths, never as inline values

`serverless-yml.ts` in `packages/deploy/deploy-serverless/src/` writes the global
`environment` block (lines 46-54). For each secret in the manifest it emits
`<id>: ${ssm:/<projectId>/${self:provider.stage}/<id>}` (lines 47-50). The value is
resolved by Serverless from SSM at deploy time, so the generated file contains only the
parameter path.

Variables are handled differently. Each is emitted as `${self:custom.<id>, ''}` (lines
52-53), and the `custom` block gives each variable an empty default (lines 87-90).

The local SQS endpoint with fixed `root` credentials (lines 98-106) sits inside the
`serverless-offline-sqs` plugin block, which is local development configuration.

**What this rules out:** writing an app secret's value into serverless.yml.
