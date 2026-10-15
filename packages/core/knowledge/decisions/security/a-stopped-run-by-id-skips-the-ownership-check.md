---
type: decision
title: Stopping an agent run by its id skips the ownership check; interruptAgent is the checked path
description: signalRunInterrupt is exported and performs no authorisation, while interruptAgent asserts the run's resource owner before it signals
tags: core, agent, security
---

# Stopping an agent run by its id skips the ownership check; interruptAgent is the checked path

`signalRunInterrupt` in `packages/core/src/wirings/agent/agent-interrupt.ts:227-236`
looks up the run and aborts it, with no check on who is asking. Its doc comment at
`:215-220` says so directly: anyone holding a `runId` can stop the run, and callers
should use `interruptAgent` unless the run's ownership is already established.

It is exported from the agent entry point (`packages/core/src/wirings/agent/index.ts:33`).

`interruptAgent` in `packages/core/src/wirings/agent/agent-stream.ts:1061-1086`
loads the run (`:1070`), asserts the resource owner with `assertResourceOwner`
(`:1074-1082`), and only then calls `signalRunInterrupt` (`:1084`). The RPC wrapper
calls `interruptAgent` (`packages/core/src/wirings/agent/agent-rpc.ts:98`).

**What this rules out:** exposing `signalRunInterrupt` to a caller who has not
resolved the run's owner, and reaching a run through its id alone on a request
path.
