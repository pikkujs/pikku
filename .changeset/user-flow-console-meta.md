---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/console': patch
'@pikku/addon-console': patch
---

User flows in the console: workflow graph extraction now captures
`workflow.expectEventually` steps and per-step actor names (`{ actor:
actors.x }`), workflow meta carries `actors`/`title` into the serialized
graph, the CLI emits `user-flow-actors.gen.json` for the new
`MetaService.getUserFlowActorsMeta()`, and the console Workflows page gains a
Workflows / User Flows / Personas toggle. Also fixes complex-workflow graphs
being clobbered by a duplicate basic-extraction pass after successful DSL
extraction.
