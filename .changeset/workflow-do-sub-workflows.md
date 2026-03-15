---
"@pikku/core": patch
"@pikku/cli": patch
---

Support sub-workflows in `workflow.do()`: when a string name is passed, it now checks if the name refers to a registered workflow and runs it as a sub-workflow, falling back to RPC invocation if not found. The `TypedWorkflow.do` type now also accepts workflow names with typed input/output. Steps that spawn sub-workflows expose `childRunId` on the step state so clients can stream sub-workflow progress.
