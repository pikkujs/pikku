---
type: decision
title: A virtual user decides whether to trust its notes once per turn, by one roll
description: The difference between the stale, newcomer and auditor dispositions is expressed as a single probability rather than as prose in each prompt
tags: core, virtual-user
---

# A virtual user decides whether to trust its notes once per turn

Each turn the run makes one weighted decision: does this user act on what it
already recorded, or go and look again.

That single roll is where the dispositions differ. `stale` almost always trusts
its notes — that is what makes it stale. A `newcomer` has none to trust. An
`auditor` re-checks nearly everything, which is the entire point of an auditor.
Expressing it as one probability keeps the difference between those runs in one
readable place instead of spread through three prompts as English that drifts.

**What this rules out:** encoding "you are suspicious of your own notes" into
each disposition's prompt text, where the behaviour becomes a property of how
the model reads prose rather than something the run controls and can report.
