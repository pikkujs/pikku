---
type: decision
title: A workflow DSL step's virtual user is the literal name written in its options object
description: The DSL extractor reads a step's virtual user from a property access or string-keyed element access in the options literal, and leaves it undefined when the value is not static
tags: inspector, workflow, dsl, virtual-users
---

# A workflow DSL step's virtual user is the literal name written in its options object

`extractVirtualUserFromOptions` in `packages/inspector/src/utils/workflow/dsl/patterns.ts`
returns the virtual user name for a step. Its doc comment says
`{ virtualUser: virtualUsers.x }` gives `'x'`, also `virtualUsers['x']`, and is
`undefined` when the virtual user is absent or "not statically resolvable"
(`patterns.ts:122-126`).

The function reads the `virtualUser` property of the options object literal
(`patterns.ts:127-150`). A property access returns its name, and a string-keyed
element access returns the string (`patterns.ts:138-146`). Any other form returns
`undefined` (`patterns.ts:149`).

The DSL extractor calls it for RPC steps (`packages/inspector/src/utils/workflow/dsl/extract-dsl-workflow.ts:790`)
and for scenario steps (`extract-dsl-workflow.ts:853`). The step is still recorded
with `virtualUser` set to `undefined` when the name is not literal.

**What this rules out:** resolving a step's virtual user from a variable, a computed
key or a runtime value at inspection time. A virtual user the inspector cannot read
statically is left blank, not guessed.
