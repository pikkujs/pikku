---
type: decision
title: The worker disposition is the only one not testing anything
description: It is doing the job, so it abandons rarely, runs cool, and is told to stop and say so rather than guess
tags: core, virtual-user
---

# The worker disposition is the only one not testing anything

Every other disposition exists to probe the product. The worker exists to _use_
it, which changes every parameter: it abandons rarely, runs at a low temperature,
and is instructed to stop and report rather than guess its way past an obstacle.

The failure mode being guarded against is different too. For the probing
dispositions the risk is a missed bug. For this one it is a wrong action nobody
asked for — a real mutation performed because the model improvised when it
should have stopped.

**What this rules out:** tuning this disposition toward the others for
consistency, in particular raising its temperature or its tolerance for
guessing. Those settings are what make the others useful and what would make this
one dangerous.
