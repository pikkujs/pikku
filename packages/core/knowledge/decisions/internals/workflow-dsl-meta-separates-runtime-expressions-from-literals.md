---
type: decision
title: Workflow DSL meta keeps runtime expressions in their own field, apart from literal values
description: A string `value` regenerates as a string literal; an `expression` regenerates as code, so the two can never share a field
tags: workflow
---

# Workflow DSL meta keeps runtime expressions in their own field, apart from literal values

Several step metas in `dsl/workflow-dsl.types.ts` carry a literal field and a
parallel `expression` field: `SetStepMeta` has `value` and `expression`
(`count + 1`), `SleepStepMeta` has `duration` and `expression` (a duration known
only at runtime, e.g. a loop variable). They are mutually exclusive by
construction because regenerated code has to emit them differently — a string
`value` becomes a string literal, an `expression` becomes raw code. Collapsing
them would make every computed assignment regenerate as a quoted string.

Two related shapes exist for the same "the extractor cannot see this
statically" reason. `ReturnStepMeta.spread` records variables spread into a
returned object (`return { ...r }`) or a sole returned variable (`return r`) by
name, because their fields are not enumerable statically and cannot be expanded
into `outputs`. `FeatureMeta.unresolvedEntries` counts feature entries that
could not be read statically (a spread, a `.map()`), so a non-zero count marks
the listing as partial rather than pretending it is complete.

`FanoutStepMeta.stepName` is optional for a different structural reason: a
fanout is not itself a cached step, and node ids are step names — borrowing a
body step's name would give the loop and that step the same id, collapsing one
onto the other.

Free-text documentation (`GraphNodeConfig.notes`,
`PikkuWorkflowGraphConfig.notes`) is excluded from the graph topology hash, so
editing a note never marks the workflow as changed and never triggers a version
mismatch on in-flight runs.

**What this rules out:** merging `expression` into `value`/`duration`, expanding
`spread` into concrete `outputs`, giving a fanout a required `stepName` taken
from its body, and folding `notes` into `graphHash`.
