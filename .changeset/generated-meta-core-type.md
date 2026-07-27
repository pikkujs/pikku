---
'@pikku/cli': patch
---

Stop the generated workflow and scenario meta files importing `@pikku/inspector`. `@pikku/inspector` is a build-time package a generated app has no reason to depend on, so the import only resolved where a package manager happened to hoist it — under bun it did not, and every bun template failed `tsc` with `TS2307: Cannot find module '@pikku/inspector/workflow-graph'`. The cast these files need is now `WorkflowsRuntimeMeta` from `@pikku/core/workflow/types`, which the generated app already depends on.
