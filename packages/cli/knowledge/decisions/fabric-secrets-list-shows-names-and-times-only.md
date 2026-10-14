---
type: decision
title: Fabric secrets list shows names and timestamps, never values
description: pikku fabric secrets list asks the stage for names and updated times, and the values stay sealed to the stage
tags: cli, fabric, secrets
---

# Fabric secrets list shows names and timestamps, never values

`FabricSecretsList` calls `listStageSecretNames` and prints each entry as
`name` and `updatedAt` (`packages/cli/src/fabric/functions/secrets-list.function.ts:39-47`).
The output schema has only those two fields (`secrets-list.function.ts:13-15`).
The description says values are sealed to the stage and never leave it
(`secrets-list.function.ts:18-19`).

The command needs a token and a linked project before it makes any call
(`secrets-list.function.ts:24-31`).

**What this rules out:** a list command that returns values, and a read path
that would make a sealed secret visible to the CLI.
