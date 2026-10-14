---
type: decision
title: SCENARIO_ACTOR_SECRET is an optional platform secret
description: The generated personas secrets file declares SCENARIO_ACTOR_SECRET as optional, so a stage with no scenarios still deploys and its actor sign-in refuses every request
tags: cli, personas, secrets, deploy
---

# SCENARIO_ACTOR_SECRET is an optional platform secret

`serializePersonasSecrets` in `packages/cli/src/functions/wirings/personas/serialize-personas-secrets.ts`
declares `scenarioActorSecret` with `secretId: 'SCENARIO_ACTOR_SECRET'` (`serialize-personas-secrets.ts:30-36`).
The comment says the platform owns the value, not the application, and that nothing in
app code reads it (`serialize-personas-secrets.ts:4-6`).

It is marked `optional: true` (`serialize-personas-secrets.ts:35`). The comment says a
stage that runs no scenarios is a supported state, and actor sign-in then refuses every
request. A required declaration would fail the deploy config gate on every such stage
(`serialize-personas-secrets.ts:13-16`).

**What this rules out:** a required scenario secret that blocks deploys of stages with no
personas, and a secret the application code could read.
