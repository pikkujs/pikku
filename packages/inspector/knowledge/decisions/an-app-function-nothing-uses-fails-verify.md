---
type: decision
title: An app function nothing uses fails pikku verify, and addon functions are never judged
description: findUnusedFunctions reports an app's own function that is not wired, exposed or called by name, as error PKU563, which pikku verify treats as a failure while pikku all still builds
tags: inspector, cli, verify, functions, disabled, addon
---

# An app function nothing uses fails pikku verify, and addon functions are never judged

`findUnusedFunctions` (`packages/inspector/src/utils/find-unused-functions.ts`) runs on the finished inspector state. A function counts as used when any of these holds:

- a wiring names it (`pikkuFuncId`, `rpcName` or `receive` anywhere in state, including channel message routes, triggers, MCP and agent tools)
- it is `expose`, `remote` or `mcp`
- it is called by name: `rpc.invoke`, workflow steps, `serviceAggregation.usedFunctions`
- it is a workflow started by a literal name: `rpc.startWorkflow`, `workflowService.startWorkflow` or `runToCompletion` (any receiver), the client helpers `workflow` / `workflowStart` / `workflowRun` / `workflowStatus` / `graphStart`, `rpc.invoke`, or another workflow's step. A workflow name maps to its function through `workflows.meta`

A workflow is a function like any other and is reported when none of these holds. Its own entry in `workflows.meta` and `graphMeta` names itself, so only what its steps call is read from there. A workflow started only with a computed name is reported; mark it used by starting it by a literal name, or disable it.

Scenarios, scenario steps, inline wiring functions and disabled functions are never reported.

`pikku all` logs each unused function as `PKU563` at severity `error` (`packages/cli/src/functions/workflows/all.workflow.ts`). The build does not fail on it, since only `critical` fails `pikku all` by default, but `pikku verify` turns every `error` into a failing finding.

**Addon functions are never judged.** In an addon project (`addon: true`) every function is an addon function, so the check returns nothing. A consumer's state holds addon functions outside `functions.meta`, so they are never candidates there either. An addon function is reachable in-process by `rpc.invoke('ns:fn')` whether or not it is exposed, so the build cannot know that one is unused.

**What this rules out:** leaving dead functions in an app. Either use the function or mark it `disabled`.
