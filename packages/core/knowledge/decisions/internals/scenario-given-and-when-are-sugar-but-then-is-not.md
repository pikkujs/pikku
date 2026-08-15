---
type: decision
title: `given` and `when` are sugar for each other; `then` is not
description: The phase decides whether a step's bindings are alternatives or witnesses, so the same step function called as `when` and as `then` runs differently
tags: core, workflow
---

# `given` and `when` are sugar for each other; `then` is not

All three run a named `pikkuScenarioStep` as one durable step. `given` and
`when` differ only in the prose a reporter renders — the step behaves
identically either way.

`then` is a different operation. The phase is what decides how a step's surface
bindings are treated: for an action, the bindings are _alternatives_ and one is
chosen; for an assertion, they are _witnesses_ and every applicable one runs and
must agree. So the same step function invoked as `when` and as `then` executes a
different number of times against a different number of surfaces.

See `resolveScenarioSurfaces` for the resolution itself.

**What this rules out:** collapsing the three into one call with a cosmetic
label, or letting a caller pass the phase as data. The phase changes execution,
so it has to be visible at the call site.
