---
type: decision
title: A mocked function is typed at the definer, not the core config
description: `func` xor `mock: true` is enforced by the generated pikkuFunc and pikkuSessionlessFunc overloads. CorePikkuFunctionConfig keeps `func` required, so a mocked config reaches the runner typed as if it had a body, and the runner refuses it.
tags: core, functions, mocks, types
---

# A mocked function is typed at the definer, not the core config

A function is either implemented (`func`) or declared `mock: true` with only its
input and output. The rule is enforced where an app writes a function: the
generated `pikkuFunc` and `pikkuSessionlessFunc` take a mock overload whose
config has `mock: true` and `func?: never`, and their implemented overloads gain
`mock?: never`. Both and neither fail to type-check.

`CorePikkuFunctionConfig` itself keeps `func` required and only gains
`mock?: true`. Making it a union of the two shapes was the stricter option and
was rejected: around forty places in core read `config.func` as a function, and
`Omit<…>` over a union (which the sessionless and schema configs are built on)
collapses it back to the shared keys. So a mocked config is returned typed as an
ordinary config, which keeps wirings and generated clients compiling against it.

The cost is that the type of a mocked config claims a body it does not have. The
runner answers that at call time: `runPikkuFunc` refuses a config with
`mock: true` with a `NotImplementedError` (501) naming the function. It does so
after the session and permission checks, so a caller learns no more about a
mock than about the real function, and before any wire service is created.
