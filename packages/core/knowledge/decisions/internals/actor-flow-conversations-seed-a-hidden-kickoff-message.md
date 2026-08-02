---
type: decision
title: An actor conversation starts from a seeded kickoff message
description: The actor's first turn needs a non-empty message list because providers reject an empty prompt; the seed is an instruction and stays out of the transcript
tags: actor-flow
---

# An actor conversation starts from a seeded kickoff message

`runConversation` in
`packages/core/src/wirings/actor-flow/run-conversation.ts` primes
`actorMessages` with a single user message telling the persona to begin, before
the first turn is generated.

The actor speaks first, so at that point there is nothing for it to reply to —
and LLM providers reject a completion request with no messages. The seed is
addressed to the actor rather than to the target agent, which is why it is never
pushed onto `transcript`: it is scaffolding, not something the simulated user
said, and including it would corrupt the transcript the final evaluation reads.

**What this rules out:** starting from an empty `actorMessages` array, folding
the kickoff into the persona instructions where a provider may weight it
differently, and pushing the seed into the transcript for symmetry.
