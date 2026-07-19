---
'@pikku/core': patch
'@pikku/inspector': patch
---

Support multi-step fanout bodies in DSL workflows.

A `Promise.all(array.map(...))` (or `for...of`) body containing more than one
`workflow.do` call previously extracted only a single step: `const`-captured
steps were skipped entirely by the parallel extractor, so a body like

```ts
await Promise.all(
  users.map(async (u) => {
    const digestData = await workflow.do('Get pipeline', 'getDigestData', { userId: u.id })
    await workflow.do('Send digest', 'sendDigestEmail', { ...digestData })
  })
)
```

produced a graph with `getDigestData` missing and `sendDigestEmail` referencing
an unregistered variable. `FanoutStepMeta.child` is replaced by
`FanoutStepMeta.body: RpcStepMeta[]`, holding the per-iteration steps inline in
the same workflow — no sub-workflow boundary. Per-iteration `const` bindings are
now registered so later steps in the same iteration can reference them, and the
sequential path no longer hard-errors on bodies with more than one step.
