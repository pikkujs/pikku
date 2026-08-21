---
'@pikku/kysely': patch
'@pikku/core': patch
---

Remove the last `@pikku/core/ecosystem` references and guard against new ones

`@pikku/kysely`'s workflow-service test still imported `StepState` from
`@pikku/core/ecosystem/workflow`, a subpath that no longer exists in
`@pikku/core`'s `exports`. Nothing caught it: the import is type-only, so tsx
erases it before it can fail at runtime, and the package tsconfig excludes
`**/*.test.ts`, so `yarn tsc` never saw it either. It now imports from
`@pikku/core/workflow`.

A new guard test in `@pikku/core` scans the repository for the dead specifier
and fails if one comes back, so the next stale import is a red test rather than
a silent `any`.
