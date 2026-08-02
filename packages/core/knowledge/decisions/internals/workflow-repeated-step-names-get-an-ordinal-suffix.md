---
type: decision
title: A workflow step name repeated in one run gets an ordinal suffix, and the first reach stays bare
description: `name`, `name#1`, `name#2` keys each reach separately without changing the durable key of any existing run
tags: workflow
---

# A workflow step name repeated in one run gets an ordinal suffix, and the first reach stays bare

`nextStepKey` in `pikku-workflow-service.ts` turns a logical step name into the
physical, replay-stable key for the Nth time the run reaches it: the bare name
for ordinal 0, `name#N` for repeats. Keeping the first reach unsuffixed is what
makes the scheme backward compatible — existing runs and their persisted step
rows are untouched — while still letting the same literal step name be invoked
several times (a loop, a helper called twice) without the rows clobbering each
other.

The counters live in the per-replay `RunContext.replay.ordinals` and are reset
by `beginReplay` on every orchestrator tick. That reset is what makes the keys
deterministic: given a deterministic workflow body, the second replay assigns
exactly the same key to the same reach and therefore finds the cached row rather
than minting `name#1` for a step that already succeeded. `nextStepKey` also
records the key it just produced as `replay.lastStep`, which is how the next
step learns its predecessor (`fromStepName`).

Graph runs use the same convention for cycle revisits, and
`stripInstanceOrdinal` / `executeWorkflowStep` map `node#N` back to the logical
node id, which is not a literal key in the graph's `nodes` map.

**What this rules out:** suffixing the first reach too (it re-keys every step of
every existing run), advancing the ordinal counters anywhere other than a fresh
replay pass, deriving step keys from a non-deterministic source, or treating a
physical step key as a graph node id without stripping the ordinal.
