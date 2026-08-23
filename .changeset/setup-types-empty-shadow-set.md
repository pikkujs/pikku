---
'@pikku/cli': patch
---

fix(cli): type the shadow-exempt set so a project that opts none in still compiles

The shadowed-services warning emitted `new Set([])` when a project declared no
`allowShadowedServices`, and TypeScript infers that as `Set<never>` — so the
`allowedToShadow.has(name)` on the next line failed to compile with a `string`.
It type-checked only for a project that had opted at least one service in, and
no project in the repo has, so every build broke on the generated setup types.

Emitted as `new Set<string>([])`.
