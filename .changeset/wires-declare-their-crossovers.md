---
'@pikku/core': patch
---

Give each wire an explicit set of crossovers

`wire.rpc.agent` was implemented inline in `rpc-runner.ts`, which put the agent turn logic — run, stream, resume, interrupt, approve — inside the RPC primitive. It moves to `ai-agent/agent-rpc.ts`, next to the runner and stream code it delegates to; `rpc-runner` imports it and the getter stays, so a request that never touches an agent never builds the facade.

The wires (`http`, `channel`, `queue`, `scheduler`, `cli`, `rpc`, `ai-agent`, `workflow`) previously imported each other ad hoc, so an accidental edge was indistinguishable from a designed one. Each wire now declares the crossovers it is allowed, and a test walks the import graph to hold it — failing both on an undeclared edge and on a declared crossover that no longer exists, so the declaration cannot rot into a rubber stamp.

`unsupportedChannelRemote` moves from `channel-rpc-service.ts` to `channel-rpc.types.ts`, alongside the error it throws.

The shared storage conformance suite splits from one 1216-line module into one module per service, so a backend author can read the contract for the service they implement. `defineServiceTests` is unchanged for callers.
