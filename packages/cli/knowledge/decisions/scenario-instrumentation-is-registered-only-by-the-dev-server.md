---
type: decision
title: Scenario instrumentation is registered only by the dev server, sessionless with auth true
description: The coverage, stub and grading endpoints are registered at runtime by registerScenarioInstrumentation, not scaffolded, and each one answers for its own session
tags: cli, scenarios, instrumentation, deploy
---

# Scenario instrumentation is registered only by the dev server

`registerScenarioInstrumentation` in
`packages/cli/src/functions/wirings/scenarios/register-scenario-instrumentation.ts` adds
five `pikku*` endpoints to the running server. The comment says they used to be scaffolded
into the project and shipped in every deployed bundle, and registering them here keeps
them in the one process that should have them (`register-scenario-instrumentation.ts:17-27`).

Each one is added with `auth: true` (`register-scenario-instrumentation.ts:161`). The comment
says the RPC dispatcher does not gate on its own, so each function answers for itself
(`register-scenario-instrumentation.ts:146-148`). The metadata marks them `sessionless: true`
(`register-scenario-instrumentation.ts:167`).

Grading needs the buffer. `enableScoreSnapshots()` is called here and nowhere else, so
retention of finished runs stays on only in a dev server (`register-scenario-instrumentation.ts:153-156`).

**What this rules out:** instrumentation endpoints in a production bundle, and a grading
path that works without the dev server that produced the run.
