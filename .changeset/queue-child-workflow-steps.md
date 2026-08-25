---
'@pikku/core': patch
---

Queue a workflow step that names another workflow, instead of running it inside its parent.

`dispatchStep` decided by reading `workflowQueued` off `rpc` meta, but `addWorkflow` never registers there, so a child workflow could never be queued. It always took the inline path: the parent started the child with `inline: true` and then sat in an unbounded `awaitRunEnd` poll, holding its run lock and that lock's connection until the child ended — and the child, being inline, ran its own `sleep` as a real in-process wait rather than a suspension. A parent whose child polled for fifteen minutes held two lock connections for fifteen minutes, and enough of them exhausted the lock pool and stalled every other run behind it.

A step naming a workflow now queues whenever a queue service exists, reaching the `ChildWorkflowStartedException` path that already unwinds the parent and resumes it when the child completes. An inline parent still runs its children inline.
