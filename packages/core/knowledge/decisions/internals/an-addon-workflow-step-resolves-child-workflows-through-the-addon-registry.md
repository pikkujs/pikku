---
type: decision
title: A workflow step names a child workflow when the name resolves in the app's or the claiming addon's workflow meta
description: Every "is this rpcName a workflow" check goes through resolveWorkflowMeta, because an addon's workflow meta is kept under its package and a step inside an addon names its siblings as namespace:name
tags: core, workflow, addon
---

# A workflow step names a child workflow when the name resolves in the app's or the claiming addon's workflow meta

A step whose rpcName names a workflow starts that workflow as a child run, and the child gets its own `workflow` wire. Anything else is called as an RPC. Every place that makes this call — the inline step (`rpcStep`), the queued step worker (`executeWorkflowStepInner`), step routing (`stepDispatchTarget`), compensation (`isChildWorkflowRecord`) and graph sub-workflow nodes — asks `resolveWorkflowMeta` / `isWorkflowName` (`packages/core/src/wirings/workflow/workflow-meta-resolver.ts`).

**Why not the app's meta alone.** An addon's workflow meta lives under its package, `pikkuState(packageName, 'workflows', 'meta')`, not the root. Inside an addon workflow, a step's bare rpcName is prefixed with the run's namespace by `createWorkflowWire`, so `workflow.do('Wait', 'waitForBuildHost', ...)` and `workflow.do('Wait', 'cloud:waitForBuildHost', ...)` both reach the step as `cloud:waitForBuildHost`. The root meta does not hold that name. Checked against it alone, the child was run as a plain RPC of its workflow function, with no `workflow` on the wire, and its first `workflow.do` threw `undefined is not an object (evaluating 'workflow.do')`. `resolveWorkflowMeta` looks the name up at root first, then maps `namespace:name` through `pikkuState(null, 'addons', 'packages')` to the package's own meta — the same lookup `startWorkflow` already used to start the child.

Pinned by `src/wirings/workflow/addon-child-workflow.test.ts` (bare and namespaced names inline, and the queued step worker) and by `verifiers/addon-registry`, whose addon's `deployWorkflow` starts its own `waitForBuildHost` by bare name in the consumer's runtime check.

**What this rules out:** a new check of the form `pikkuState(null, 'workflows', 'meta')[rpcName]` anywhere a step decides between child run and RPC.
