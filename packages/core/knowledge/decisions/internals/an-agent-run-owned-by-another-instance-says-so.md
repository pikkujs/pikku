---
type: decision
title: An interrupt for a run owned by another instance says so, rather than returning false
description: A bare false is indistinguishable from "already finished", which is the one deployment shape the in-process registry cannot cover
tags: core, ai-agent
---

# An interrupt for a run owned by another instance says so

`interruptAIAgent` resolves a run through `aiRunState`, then tries to abort it
via the in-process registry. A run still marked `running` that this process has
no abort handle for is executing on another instance.

Returning a bare `false` there is indistinguishable from "the run already
finished" — the ordinary, uninteresting outcome. So the single deployment shape
the in-process registry does not cover, multi-instance, fails silently: an agent
that will not stop talking, and nothing in the logs to say why. The call reports
the condition instead.

**What this rules out:** collapsing the two outcomes into one boolean because
the caller "only cares whether it stopped". The caller cares a great deal about
the difference between *stopped* and *cannot be stopped from here*.

The fix for the underlying gap is `signalRunInterrupt`, which fans the interrupt
out over `eventHub` so every instance tries locally.
