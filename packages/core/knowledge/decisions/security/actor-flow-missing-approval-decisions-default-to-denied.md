---
type: decision
title: An actor's missing approval decision defaults to denied
description: Every pending tool call gets an explicit decision; an id the persona LLM omitted is denied, so a dropped field can never read as consent
tags: actor-flow
---

# An actor's missing approval decision defaults to denied

`decideApprovals` in
`packages/core/src/wirings/actor-flow/run-conversation.ts` maps over the
target agent's `pendingApprovals`, not over the decisions the persona LLM
returned. Any `toolCallId` the model omitted, hallucinated, or renamed resolves
to `approved: false`.

The persona's decision comes from a structured LLM call, and structured output
is not guaranteed to be complete. Iterating the model's array instead would make
an omission indistinguishable from silence — and silence would let a scenario
approve a destructive tool call nobody decided on, then pass.

**What this rules out:** building the decision list from the LLM's `decisions`
array, and defaulting an unmatched call to `true` to keep a conversation moving.
