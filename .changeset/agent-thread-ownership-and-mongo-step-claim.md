---
'@pikku/addon-console': patch
'@pikku/mongodb': patch
'@pikku/core': patch
---

Gate console agent-thread reads and deletes on thread ownership, claim MongoDB workflow steps atomically, and reach the deployment fallback from `rpcWithWire`

`getAgentThreadMessages` and `deleteAgentThread` in the console addon took a
caller-supplied `threadId` straight to storage, while their siblings
`getAgentThreads` and `getAgentThreadRuns` already filtered to what the session
owns. Both now carry an `isThreadOwner` permission: an admin reaches any thread,
everyone else only their own, and a missing thread is refused rather than 404'd
so it is indistinguishable from someone else's.

`MongoDBWorkflowService` claimed a step by reading its status and then writing
it, under a `withStepLock` that is a pass-through — so two dispatches racing for
the same step could both proceed and run a side-effecting step twice. The claim
is now a single status-guarded update, atomic on one document.

`rpcWithWire` threw `RPCNotFoundError` for any unresolved namespaced call
instead of falling through to the deployment service, so a namespaced RPC that
`rpc()` would have dispatched remotely failed when called with an explicit wire.
