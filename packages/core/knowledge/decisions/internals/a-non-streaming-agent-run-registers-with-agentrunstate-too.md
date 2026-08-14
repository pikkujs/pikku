---
type: decision
title: A non-streaming agent run registers with agentRunState on the same terms as a streaming one
description: Otherwise interruptAgent finds the run, passes the ownership check, then cannot stop it — and reports that as if the run were on another host
tags: core, agent
---

# A non-streaming agent run registers with `agentRunState` too

`runAgent` registers its run with `agentRunState` exactly as `streamAgent`
does, even though nothing is streaming and there is no channel to interrupt.

`interruptAgent` resolves a run through `agentRunState` first, checks ownership,
then looks for a local abort handle. A run that skipped registration is invisible
at the first step. A run that registered but has no handle is visible, passes the
ownership check, and then cannot be stopped — which the interrupt path reports as
"running on another instance". That message would be wrong and actively
misleading: the run is right here, and the deployment is single-instance.

**What this rules out:** treating registration as a streaming concern. It is an
addressability concern, and the two paths have to be addressable the same way for
the interrupt path's diagnosis to mean anything.
