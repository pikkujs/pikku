---
'@pikku/core': patch
---

A child workflow now inherits the `pikkuUserId` its parent was running as

`PikkuWorkflowService` filled parts of the wire it builds for a workflow body and for a child run from the RPC service it had been handed — `rpcService.wire?.session`, `rpcService.wire?.rpc`, `rpcService.wire?.pikkuUserId`. `PikkuRPC` has no `wire`, and neither does the object the RPC service actually returns, so every one of those reads was `undefined`; the `rpcService: any` parameter type is what kept it quiet. The visible consequence was that a child workflow started from a step ran as nobody.

Those reads now come from the run record, which is durable and survives the process boundary a queued step crosses. `session` and `rpc` are not copied at all: `runPikkuFunc` attaches `rpc` lazily per invocation and resolves the session from the session store, so both were overwritten moments later regardless. The wires these paths build are typed `PikkuRawWire`, which is what they have always been.

`PikkuRPC` also now declares `rpcWithWire`, which the RPC service has always returned and the workflow service has always called.
