---
'@pikku/core': patch
---

Restrict a graph workflow's `startNode` to its declared entry nodes.

The scaffolded public route `POST /workflow/:name/graph/:nodeId` passes `:nodeId`
straight through as `startNode`, and `validateGraphReferences` only checked that
the node exists. A caller could name any dependency-free node — one whose input
reads only `trigger` — and fire its RPC directly with chosen data, skipping every
upstream eligibility, validation or approval node. These node RPCs are internal,
so the public `/rpc` endpoint refuses them; this route was the only outside path
to them.

`startWorkflow` — the boundary the public route and triggers enter through — now
rejects a `startNode` that is not in the graph's `entryNodeIds`. Internal
resume/replay drives `runWorkflowGraph` directly and keeps full node targeting,
so the check sits at the trust boundary rather than in the low-level runner.

CWE-20 / CWE-863.
