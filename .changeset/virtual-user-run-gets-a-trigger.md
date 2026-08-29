---
'@pikku/cli': patch
---

Give a virtual user run a trigger so it survives a per-function deploy.

`scaffold.virtualUser` dispatched `executeVirtualUserRun` with an unawaited
`rpc.invoke`. That is a real dispatch in one process and nothing at all under a
deployment that puts each function in its own unit: the run function is
sessionless, unexposed and wired to nothing, so it is never emitted as a unit,
the RPC resolves to nothing, and the rejection is swallowed by the `catch` that
exists to stop an unhandled rejection taking the process down. The run parks at
`running` with zero steps and no error anywhere.

The scaffold now wires it to a `pikku-virtual-user-runs` queue worker, which is
what puts it in the deploy manifest, and `runVirtualUser` enqueues onto that
queue at `attempts: 1` — a redelivery would be a second different outing writing
into a record that already has an outcome. A project with no queue service keeps
the in-process dispatch, which is correct for the one process it runs in.
