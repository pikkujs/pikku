---
type: decision
title: Scenario step targets are string literals so the inspector can read them statically
description: `step/given/when/then` mirror `do`'s RPC shape because the extractor reads a literal, not an imported symbol
tags: workflow
---

# Scenario step targets are string literals so the inspector can read them statically

`ScenarioStepInvocation` in `dsl/workflow-dsl.types.ts`, and the `step`,
`given`, `when` and `then` members of `PikkuScenarioWire`, all take
`(stepName, stepFunc: string, data?, options?)` — deliberately the same shape as
`WorkflowWireDoRPC`. The target is a string, not an imported symbol, because
the Pikku inspector is static analysis: it reads the argument as a literal and
does not resolve identifiers. Type safety comes back at the edges — the
generated `TypedScenario` narrows these over `FlattenedScenarioStepMap`.

`given`/`when`/`then` are pure sugar over `step`; the phase only changes the
prose a reporter renders (`scenario-prose.ts`), never what executes.

The prose direction is itself the decision: rather than parsing English into a
call the way cucumber does, `composeStepProse` renders English out of a typed
call, so a readable report survives without a regex registry paying for it. It
lives in core so the CLI reporter and the console render the same sentence for
the same step, and `renderStepTemplate` fills `{placeholders}` from the input
the step was actually called with — "sees @pikku/addon-todos" rather than the
same generic sentence three times. A placeholder with no recorded value renders
as nothing and the surrounding whitespace collapses, so an omitted optional
input reads as a shorter sentence rather than leaking a literal `{state}`.

**What this rules out:** changing `stepFunc` to accept the imported step config,
reordering the arguments away from `do`'s shape, giving `given`/`when`/`then`
behaviour of their own, or moving prose rendering into the CLI where the console
would drift from it.
