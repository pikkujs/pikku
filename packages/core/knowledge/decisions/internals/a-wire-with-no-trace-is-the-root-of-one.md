---
type: decision
title: A wire with no trace is the root of one
description: runPikkuFunc creates a trace for a wire that has none, so a CLI command, an MCP call or a new wire type is traced without its runner doing anything.
tags: core, observability
---

# A wire with no trace is the root of one

`runPikkuFunc` is the one place every invocation passes through, so it creates
the trace for a wire that arrives without one. CLI commands and MCP calls rely
on this, and a wire type added later is traced by default.

A runner still sets the trace itself when it matters earlier or wider than one
function: a gateway's middleware runs before `runPikkuFunc`, and a trigger shares
one trace between all the targets of an event.

The same place wraps `queueService`, `schedulerService` and `webhookService`, so
what a function hands to them is stamped with its trace. A service that calls
them from outside a function has no wire and passes `traceparent` itself, as
`IncomingWebhookService.accept` and `scoreFinishedRun` do.

The steps of a workflow are flat under the span that started the run. A step's
parent is not the previous step, because steps can run in parallel and nothing
stores a step's span: recording one needs a column in every workflow store.
