---
'@pikku/inspector': patch
---

fix(inspector): don't reject plain destructuring in DSL workflows

`extractDestructuredDeclaration` reported "Destructuring a step result is not
supported in DSL workflows" for EVERY destructuring statement whose initializer
wasn't `await Promise.all([...])` — including ordinary local bindings that
involve no step at all, such as `const { runId } = input`.

Destructuring the workflow's own input is the single most idiomatic line in a
DSL workflow, so this rejected working workflows wholesale under a message
about step results that named nothing the author had written.

The diagnostic now fires only when the destructured initializer really is a
step (`await workflow.do(...)`, a parallel group, or a parallel fanout).
Anything else passes through as a non-step, exactly as the identifier path
already does for `const x = someLocal`.
