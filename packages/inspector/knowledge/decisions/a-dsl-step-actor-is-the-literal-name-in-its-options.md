---
type: decision
title: A workflow DSL step's actor is the literal name written in its options object
description: The DSL extractor reads a step's actor from a property access or string-keyed element access in the options literal, and leaves it undefined when the value is not static
tags: inspector, workflow, dsl, actors
---

# A workflow DSL step's actor is the literal name written in its options object

`extractActorFromOptions` in `packages/inspector/src/utils/workflow/dsl/patterns.ts`
returns the actor name for a step. Its doc comment says `{ actor: actors.x }` gives
`'x'`, also `actors['x']`, and is `undefined` when the actor is absent or "not
statically resolvable" (`patterns.ts:123-126`).

The function reads the `actor` property of the options object literal
(`patterns.ts:127-150`). A property access returns its name, and a string-keyed
element access returns the string (`patterns.ts:138-147`). Any other form returns
`undefined` (`patterns.ts:149`).

The DSL extractor calls it for RPC steps (`packages/inspector/src/utils/workflow/dsl/extract-dsl-workflow.ts:790`)
and for scenario steps (`extract-dsl-workflow.ts:853`). The step is still recorded
with `actor` set to `undefined` when the actor is not literal.

**What this rules out:** resolving a step's actor from a variable, a computed key or
a runtime value at inspection time. An actor the inspector cannot read statically
is left blank, not guessed.
