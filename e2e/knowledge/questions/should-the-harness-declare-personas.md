---
type: note
title: Should the harness declare personas?
description: Unanswered — every actor here is its own kind, so persona ids resolve to nothing
tags: scenarios, knowledge
---

# Should the harness declare personas?

This project declares six actors and no personas. A `persona:` resource in a note
would therefore resolve to nothing, and the resource check would call it drift —
correctly, because nobody declared it.

The open question is whether that is a gap or the right shape. The harness's
actors are picked to sit on opposite sides of a gate (`guest` holds the scope,
`admin` does not, `staff` is an admin without a scope role), which is a *grant*
distinction rather than a *kind* distinction. Personas would add a layer that
carries no information here.

Against that: an app-shaped project has personas, the knowledge skill documents
`persona:` as a resource kind, and a harness that never exercises it leaves the
prefix untested by anything but unit tests.

Nobody has needed it yet, so nothing has been decided. See
[actor](../entities/actor.md) for the distinction itself.
