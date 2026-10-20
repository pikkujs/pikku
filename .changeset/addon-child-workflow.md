---
'@pikku/core': patch
---

An addon workflow can now start another of the addon's workflows from a step. A step naming the child by bare name (`workflow.do('Wait', 'waitForBuildHost', data)`) or as `namespace:name` used to be checked against the app's workflow meta only. An addon keeps its workflow meta under its own package, so the child ran as a plain RPC with no `workflow` on its wire, and its first `workflow.do` threw `undefined is not an object (evaluating 'workflow.do')`. Every place a step decides between a child run and an RPC (inline steps, the queued step worker, step routing, compensation and graph sub-workflow nodes) now resolves the name through the addons registry, as `startWorkflow` already did.
