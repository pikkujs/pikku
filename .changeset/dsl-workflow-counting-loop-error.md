---
'@pikku/inspector': patch
---

Hard-error on a for-of a DSL workflow can't model, instead of silently dropping it.

A `pikkuWorkflowFunc` (DSL) whose body contained a computed/counting loop — e.g. `for (const i of [...Array(n).keys()])` — used to serialize with **zero steps**: the DSL extractor only models a for-of as a sequential fanout over a data-array identifier/field (`data.items`), so a non-path iterable made `extractSequentialFanout` return null and the extractor dropped the loop *and every `workflow.do` inside it*. The invoked functions then never entered `invokedFunctions`, so they got no `addFunction()` registration and threw `Function not found` at runtime — a silent codegen footgun that bricked every prod sandbox create.

Now the extractor pushes a validation error naming the offending for-of, so `pikkuWorkflowFunc` reports `INVALID_DSL_WORKFLOW` at codegen. A genuine control-flow/counting loop belongs in `pikkuWorkflowComplexFunc`, which falls back to the basic AST walk that *does* register loop-invoked functions.
