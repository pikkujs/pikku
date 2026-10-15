---
type: decision
title: Workflow helper functions are registered sessionless by declaration
description: Queue-worker helpers and the workflow sleeper get meta with sessionless true, so the runner requires a session for them only where their own auth flag says so
tags: core, workflow, queue, sessions
---

# Workflow helper functions are registered sessionless by declaration

`helperFunctionMeta` in `packages/core/src/wirings/workflow/workflow-queue-wiring.ts` returns the function meta for internal workflow helpers. It sets `sessionless: true` and `functionType: 'helper'`, and sets no `expose` flag (`workflow-queue-wiring.ts:19-25`).

It is applied to each queue worker function that has no meta yet (`workflow-queue-wiring.ts:66-68`), and to the built-in `pikkuWorkflowSleeper` (`workflow-queue-wiring.ts:122-129`).

With `sessionless` set, the runner requires a session only when the wiring, the function config, or the addon says `auth: true` (`packages/core/src/function/function-runner.ts:385-395`). The helpers therefore run without a session unless one of those says otherwise.

The helpers are internal. Their safety rests on the absence of `expose`, and on the scenario and workflow rules that keep such functions off the network surface ([scenario-step functions are never externally invocable](scenario-step-functions-are-never-externally-invocable.md)).

**What this rules out:** declaring a function that acts on a user's behalf as a workflow helper to skip its session requirement, and exposing a helper over RPC by adding `expose` to its meta.
