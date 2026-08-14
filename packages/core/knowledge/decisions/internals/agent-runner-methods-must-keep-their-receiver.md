---
type: decision
title: AI runner methods must be called on the runner, never as detached references
description: Implementations use this internally, so grabbing transcribe or generateSpeech as a bare function loses the receiver and throws at runtime
tags: agent
---

# AI runner methods must be called on the runner, never as detached references

The voice middlewares in `voice-input.ts` and `voice-output.ts` invoke
`agentRunner.transcribe(...)` and `agentRunner.generateSpeech?.(...)` as
method calls on the service object, and only ever test them for presence.

`AgentRunnerService` is an interface implemented by classes — the reference
implementation's `transcribe` calls `this.getModel(...)`. Extracting the method
into a local (`const { transcribe } = services.agentRunner`) type-checks
cleanly and then fails at runtime with `this` undefined. The regression is
pinned by a runner in `voice-input.test.ts` whose `transcribe` deliberately reads
instance state through `this`.

**What this rules out:** destructuring runner methods for brevity, and passing
`runner.transcribe` as a callback without binding it.
