---
type: decision
title: A workflow run owns its trace
description: The traceparent is stored on WorkflowRunWire and every hop continues it; workers restart, so nothing but the run record can hold it
tags: core, workflow, observability
---

# A workflow run owns its trace

A run outlives the process and the request that started it. Its steps run in
other workers, wake after sleeps, and are re-driven by recovery. The only thing
all of those read is the run record, so the trace lives there, as
`run.wire.traceparent`. This follows
[a workflow's wire is built from the run record](a-workflow-wire-is-built-from-the-run-not-from-the-rpc-service.md).

`createRun` calls `withRunTrace`, so every stored run holds a valid trace: a start
from a wire with none, such as a trigger, or with an invalid one, gets a new one
and keeps it. `startWorkflow` prefers the wire's `traceparent`, then the caller's
`rpc.traceparent`.

Stores do not know about it. They persist `wire` whole, and the shared service
tests assert the round trip.

Each hop then calls `runTraceWire(run.wire.traceparent)`: the same trace id, a new
span, and the span that started the run as parent. Each attempt of a step is its
own span.

## Every hop has the same parent

Spans do not chain through the orchestrator. A step's parent is the span that
started the run, not the orchestrator pass that dispatched it, because the
orchestrator's span is not durable and a recovered run has no way to name it. The
tree is flat, which is enough to find everything a run did.

A child workflow takes its parent's wire explicitly rather than reading it back,
because in a Durable Object `getRun` of another run returns nothing. Its run
inherits the traceparent, so the whole family is one trace.

Queue jobs and DO dispatches carry the same traceparent, so a worker does not
need to read the run before its first log line. Sleep wake-ups pass it to
`scheduleRPC`.

## Not on the trace yet

An agent's tool calls build a fresh wire in `agent-prepare.ts`, so an agent step
keeps the run's trace up to the agent, and its tools do not.

The span of a step is told apart from the calls its function makes: `runTraceWire`
marks the trace object it builds for a step with its run and step (`markWorkflowStep`),
and the function runner reads the mark off `wire.trace`, never off the wire, since a
nested call copies the step's wire. Only that span is a `consumer` carrying
`pikku.workflow.run_id` and `pikku.workflow.step`.
