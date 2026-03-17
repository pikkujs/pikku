---
"@pikku/core": minor
"@pikku/cli": minor
---

Add `inline` property to workflow function definitions. When `inline: true` is set on a workflow, it always executes inline without dispatching to the queue service, even when a queue service is available. This is useful for workflows that should run synchronously within the parent process (e.g. scaffolding/setup steps that produce local files).

The flag flows from the function definition through the inspector, into the serialized workflow graph, and is checked at runtime by the workflow service.
