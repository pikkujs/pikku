---
type: note
title: Should the harness run its personas?
description: Unanswered — four of the six carry a disposition, and nothing runs them
tags: scenarios, knowledge
---

# Should the harness run its personas?

The older form of this question — *should the harness declare personas at all?* —
answered itself. There used to be a choice between declaring six actors and
declaring the kinds of person behind them; there is now one declaration, so every
body here is a persona and `persona:` resolves against
`tests/scenarios/personas.ts`. See [persona](../entities/persona.md).

What is left open is the running. Four of the six carry a `disposition`, which is
all it takes to make them virtual users — `shopper` careless, `support`
realistic, `staff` adversarial, `guest` an auditor — and nothing in CI runs any
of them. They are declared, generated, and exercised only by the scenarios that
cast them.

For running them: an adversarial persona is the only thing here that probes the
scope gates without being told where they are, and the gates are the point of
this harness. Against: a run costs tokens, needs a live stage and a model, and
produces findings rather than a pass or a fail — which is not a thing a CI job
knows what to do with.

Nobody has needed it yet, so nothing has been decided.
