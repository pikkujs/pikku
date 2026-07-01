---
'@pikku/cli': patch
'@pikku/inspector': patch
---

Fail `pikku all` when more than one `@pikku/core` version is installed. A split
`@pikku/core` produces two separate `pikkuState` registries at runtime, so wirings
(workflows, RPCs, queue workers, middleware) register into one copy while the runner
reads the other and they silently fail to resolve (e.g. `WorkflowNotFoundError` for a
workflow that is clearly registered). The preflight scans the project's `node_modules`,
and errors (`PKU717`) with the offending versions/paths. Override with
`PIKKU_ALLOW_DUPLICATE_CORE=1` to downgrade to a warning.
