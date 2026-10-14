---
type: decision
title: Only the production flag of each environment ships in the workflow bundle
description: serializePersonas projects each environment down to its production flag, so the deployed bundle does not carry apiUrl or paths from pikku.config.json
tags: cli, personas, workflow, bundle
---

# Only the production flag of each environment ships in the workflow bundle

`serializePersonas` in `packages/cli/src/functions/wirings/workflow/serialize-personas.ts`
maps each environment to `{ production: true }` or `{}` (`serialize-personas.ts:21-26`).
The comment says the rest of an environment entry is its apiUrl and paths, which belong
to the machine running `pikku scenario` and have no place in the deployed bundle
(`serialize-personas.ts:18-20`).

The projected object is written as `personaEnvironments` (`serialize-personas.ts:58`).
The comment there says the run-time check does not trust which artifact got deployed,
so the rule needs the production flag inside the bundle (`serialize-personas.ts:49-56`).

**What this rules out:** local machine URLs in a deployed artifact, and a runtime that
cannot tell a production environment from a test one.
