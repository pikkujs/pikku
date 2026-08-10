---
type: decision
title: The catalogue is the only gate on what a virtual user may call
description: Narrowing happens once at derivation, so there is no second check in the run loop that could drift out of step with it
tags: core, virtual-user
---

# The catalogue is the only gate on what a virtual user may call

What a virtual user may invoke is decided once, when the catalogue is narrowed
for its disposition: a read-only disposition is never offered a mutation, and an
approval-gated endpoint is never offered at all.

The run loop then indexes into that catalogue and calls what it finds. There is
deliberately no second permission check at call time, because a second check is
a second thing to keep correct — and the failure mode of the two disagreeing is
that one of them silently stops mattering.

**What this rules out:** adding a "defence in depth" guard in the run loop. It
would not be defence in depth; it would be a duplicate of the derivation rules,
maintained separately, and the one that runs first wins.
